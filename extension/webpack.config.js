const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';
  
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
    path: path.resolve(__dirname, 'dist'),
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
        use: 'ts-loader',
        exclude: /node_modules/,
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
                plugins: [
                  require('tailwindcss'),
                  require('autoprefixer'),
                ],
              },
            },
          },
        ],
      },
      {
        test: /shadow-dom\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  require('tailwindcss'),
                  require('autoprefixer'),
                ],
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
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(isDevelopment ? 'development' : 'production'),
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: './src/options/options.html',
      filename: 'options.html',
      chunks: ['options'],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: './src/manifest.json',
          to: 'manifest.json',
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
    cache: {
      type: 'filesystem',
    },
    watchOptions: {
      ignored: /node_modules/,
      poll: 1000, // Check for changes every second
    },
  }),
  optimization: {
    splitChunks: {
      chunks(chunk) {
        // Disable code splitting for content script and background (SW must be single file)
        return chunk.name !== 'content' && chunk.name !== 'background';
      },
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks(chunk) {
            // Only create vendor chunk for popup and options, not content or background
            return chunk.name !== 'content' && chunk.name !== 'background';
          },
        },
      },
    },
    runtimeChunk: {
      name: (entrypoint) => {
        // Disable runtime chunk for content script and background service worker
        return (entrypoint.name === 'content' || entrypoint.name === 'background') ? false : `runtime-${entrypoint.name}`;
      },
    },
  },
};};
