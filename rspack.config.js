const path = require('path');
const rspack = require('@rspack/core');

module.exports = (env, argv) => {
  const targetBrowser = (env && env.browser) || process.env.BROWSER || 'chrome';
  const isFirefox = targetBrowser === 'firefox';
  const isDevelopment = argv.mode === 'development';

  const outputPath = path.resolve(__dirname, 'dist', targetBrowser);

  return {
    entry: {
      background: './src/background/index.ts',
      content: './src/content/simple-trigger.ts',
      'content-simple-test': './src/content-simple-test.js',
      popup: './src/popup/index.tsx',
      options: './src/options/index.tsx',
      'shadow-dom-styles': './src/styles/shadow-dom.css',
    },
    output: {
      path: outputPath,
      filename: '[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@services': path.resolve(__dirname, 'src/services'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@types': path.resolve(__dirname, 'src/types'),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: 'automatic',
                    refresh: false, // Disabled to prevent $RefreshReg$ errors in content scripts
                  },
                },
              },
            },
          },
        },
        {
          test: /\.css$/,
          exclude: /shadow-dom\.css$/,
          use: [
            'style-loader',
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [require('tailwindcss'), require('autoprefixer')],
                },
              },
            },
          ],
        },
        {
          test: /shadow-dom\.css$/,
          use: [
            rspack.CssExtractRspackPlugin.loader,
            'css-loader',
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [require('tailwindcss'), require('autoprefixer')],
                },
              },
            },
          ],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg)$/,
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new rspack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(
          isDevelopment ? 'development' : 'production'
        ),
        'process.env.TARGET_BROWSER': JSON.stringify(targetBrowser),
      }),
      new rspack.CssExtractRspackPlugin({
        filename: '[name].css',
      }),
      new rspack.HtmlRspackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
      }),
      new rspack.HtmlRspackPlugin({
        template: './src/options/options.html',
        filename: 'options.html',
        chunks: ['options'],
      }),
      new rspack.CopyRspackPlugin({
        patterns: [
          {
            from: './src/manifest.json',
            to: 'manifest.json',
            transform(content) {
              const manifest = JSON.parse(content.toString());
              if (isFirefox) {
                // Firefox (and Zen) stable channels still rely on MV2.
                manifest.manifest_version = 2;
                if (manifest.background && manifest.background.service_worker) {
                  manifest.background = {
                    scripts: [manifest.background.service_worker],
                    persistent: true,
                  };
                }
                if (manifest.action) {
                  manifest.browser_action = manifest.action;
                  delete manifest.action;
                }
                const unsupportedPerms = new Set(['scripting']);
                const combinedPermissions = [
                  ...(manifest.permissions || []),
                  ...(manifest.host_permissions || []),
                ].filter(permission => !unsupportedPerms.has(permission));
                if (combinedPermissions.length > 0) {
                  manifest.permissions = Array.from(
                    new Set(combinedPermissions)
                  );
                }
                delete manifest.host_permissions;

                if (Array.isArray(manifest.web_accessible_resources)) {
                  const resources = manifest.web_accessible_resources.flatMap(
                    entry => {
                      if (typeof entry === 'string') return [entry];
                      if (entry && Array.isArray(entry.resources))
                        return entry.resources;
                      return [];
                    }
                  );
                  manifest.web_accessible_resources = Array.from(
                    new Set(resources)
                  );
                }

                if (manifest.content_security_policy) {
                  if (typeof manifest.content_security_policy === 'object') {
                    manifest.content_security_policy =
                      manifest.content_security_policy.extension_pages ||
                      "script-src 'self'; object-src 'self';";
                  }
                }

                delete manifest.minimum_chrome_version;
                manifest.browser_specific_settings = {
                  gecko: {
                    id: 'qa-command-center@example.com',
                    strict_min_version: '91.0',
                  },
                };
              }
              return Buffer.from(JSON.stringify(manifest, null, 2));
            },
          },
          {
            from: './public/icons',
            to: 'icons',
          },
          {
            from: './public/assets',
            to: 'assets',
            noErrorOnMissing: true,
          },
          {
            from: './src/test-content.js',
            to: 'test-content.js',
          },
          // Scripts for recording removed
          {
            from: './src/test-minimal.js',
            to: 'test-minimal.js',
          },
          {
            from: './src/content-standalone.js',
            to: 'content-standalone.js',
          },
        ],
      }),
    ],
    // Development optimizations
    ...(isDevelopment && {
      devtool: 'inline-source-map',
    }),
    optimization: {
      splitChunks: {
        chunks(chunk) {
          // Disable code splitting for content script and background (SW must be single file)
          return chunk.name !== 'content' && chunk.name !== 'background';
        },
        cacheGroups: {
          vendor: {
            test: /[\/]node_modules[\/]/,
            name: 'vendor',
            chunks(chunk) {
              // Only create vendor chunk for popup and options, not content or background
              return chunk.name !== 'content' && chunk.name !== 'background';
            },
          },
        },
      },
      // Simplified runtimeChunk to avoid boolean return issue
      runtimeChunk: false, 
    },
  };
};