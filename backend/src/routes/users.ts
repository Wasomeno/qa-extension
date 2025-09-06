import { Router, Request, Response } from 'express';
import Joi from 'joi';
import multer from 'multer';
import sharp from 'sharp';
import { DatabaseService } from '../services/database';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rateLimiter, uploadRateLimiter } from '../middleware/rateLimiter';
import { 
  asyncHandler, 
  validateRequest,
  sendResponse,
  sendError,
  ValidationError,
  NotFoundError,
  AuthorizationError
} from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const db = new DatabaseService();

// Configure multer for avatar uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Validation schemas
const updateProfileSchema = Joi.object({
  fullName: Joi.string().min(2).max(100),
  bio: Joi.string().max(500).allow(''),
  location: Joi.string().max(100).allow(''),
  website: Joi.string().uri().allow(''),
  timezone: Joi.string().max(50),
  preferences: Joi.object({
    theme: Joi.string().valid('light', 'dark', 'auto'),
    language: Joi.string().max(10),
    notifications: Joi.object({
      email: Joi.boolean(),
      slack: Joi.boolean(),
      browser: Joi.boolean(),
      issues: Joi.boolean(),
      recordings: Joi.boolean(),
      mentions: Joi.boolean()
    })
  })
});

const updateUserSchema = Joi.object({
  fullName: Joi.string().min(2).max(100),
  email: Joi.string().email(),
  role: Joi.string().valid('admin', 'user', 'manager'),
  isActive: Joi.boolean(),
  bio: Joi.string().max(500).allow(''),
  location: Joi.string().max(100).allow(''),
  timezone: Joi.string().max(50)
});

const searchUsersSchema = Joi.object({
  query: Joi.string().min(1).max(100),
  role: Joi.string().valid('admin', 'user', 'manager'),
  isActive: Joi.boolean(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('created_at', 'full_name', 'email', 'last_active').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Get current user profile
router.get('/me',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    try {
      const user = await db.users()
        .where('id', userId)
        .select([
          'id', 'email', 'username', 'full_name', 'avatar_url', 
          'bio', 'location', 'website', 'timezone', 'role', 
          'preferences', 'created_at', 'updated_at'
        ])
        .first();

      if (!user) {
        throw new NotFoundError('User');
      }

      // Get user statistics
      const stats = await getUserStats(userId);

      sendResponse(res, 200, true, 'Profile retrieved successfully', {
        user: {
          ...user,
          stats
        }
      });
    } catch (error) {
      logger.error('Get profile error:', error);
      throw error;
    }
  })
);

// Update current user profile
router.put('/me',
  authMiddleware.authenticate,
  rateLimiter,
  validateRequest(updateProfileSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const updateData = req.body;

    try {
      const updatedUser = await db.users()
        .where('id', userId)
        .update({
          ...updateData,
          updated_at: new Date()
        })
        .returning([
          'id', 'email', 'username', 'full_name', 'avatar_url', 
          'bio', 'location', 'website', 'timezone', 'role', 
          'preferences', 'updated_at'
        ]);

      if (!updatedUser || updatedUser.length === 0) {
        throw new NotFoundError('User');
      }

      logger.logUserAction('Profile updated', userId, updateData);

      sendResponse(res, 200, true, 'Profile updated successfully', {
        user: updatedUser[0]
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      throw error;
    }
  })
);

// Upload avatar
router.post('/me/avatar',
  authMiddleware.authenticate,
  uploadRateLimiter,
  upload.single('avatar'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;

    if (!req.file) {
      throw new ValidationError('Avatar file is required');
    }

    try {
      // Process and save avatar
      const avatarUrl = await processAndSaveAvatar(req.file.buffer, userId);

      // Update user record
      const updatedUser = await db.users()
        .where('id', userId)
        .update({
          avatar_url: avatarUrl,
          updated_at: new Date()
        })
        .returning(['id', 'avatar_url']);

      logger.logUserAction('Avatar uploaded', userId);

      sendResponse(res, 200, true, 'Avatar updated successfully', {
        avatarUrl: updatedUser[0].avatar_url
      });
    } catch (error) {
      logger.error('Avatar upload error:', error);
      throw error;
    }
  })
);

// Get user by ID
router.get('/:id',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: targetUserId } = req.params;
    const currentUserId = req.user!.id;
    const currentUserRole = req.user!.role;

    try {
      // Check if user can view this profile
      const canViewFullProfile = currentUserId === targetUserId || 
                                currentUserRole === 'admin' || 
                                await areUsersInSameTeam(currentUserId, targetUserId);

      const selectFields = canViewFullProfile ? 
        ['id', 'email', 'username', 'full_name', 'avatar_url', 'bio', 'location', 'website', 'timezone', 'role', 'created_at'] :
        ['id', 'username', 'full_name', 'avatar_url', 'bio', 'location', 'created_at'];

      const user = await db.users()
        .where('id', targetUserId)
        .where('is_active', true)
        .select(selectFields)
        .first();

      if (!user) {
        throw new NotFoundError('User');
      }

      // Get public statistics
      const stats = await getUserStats(targetUserId, !canViewFullProfile);

      sendResponse(res, 200, true, 'User retrieved successfully', {
        user: {
          ...user,
          stats
        }
      });
    } catch (error) {
      logger.error('Get user error:', error);
      throw error;
    }
  })
);

// Search users
router.get('/',
  authMiddleware.authenticate,
  validateRequest(searchUsersSchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, role, isActive, page, limit, sortBy, sortOrder } = req.query as any;
    const currentUserId = req.user!.id;
    const currentUserRole = req.user!.role;

    try {
      let dbQuery = db.users()
        .select([
          'id', 'username', 'full_name', 'avatar_url', 'bio', 
          'location', 'role', 'created_at'
        ])
        .where('is_active', isActive !== undefined ? isActive : true);

      // Text search
      if (query) {
        dbQuery = dbQuery.where(function() {
          this.where('full_name', 'ilike', `%${query}%`)
              .orWhere('username', 'ilike', `%${query}%`)
              .orWhere('email', 'ilike', `%${query}%`);
        });
      }

      // Role filter
      if (role) {
        dbQuery = dbQuery.where('role', role);
      }

      // Admin can see more fields
      if (currentUserRole === 'admin') {
        dbQuery = dbQuery.select([
          'id', 'email', 'username', 'full_name', 'avatar_url', 
          'bio', 'location', 'role', 'is_active', 'created_at', 'updated_at'
        ]);
      }

      // Get total count
      const totalQuery = dbQuery.clone();
      const [{ count }] = await totalQuery.count('* as count');
      const total = parseInt(count as string);

      // Apply pagination and sorting
      const offset = (page - 1) * limit;
      const users = await dbQuery
        .orderBy(sortBy, sortOrder)
        .limit(limit)
        .offset(offset);

      sendResponse(res, 200, true, 'Users retrieved successfully', {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Search users error:', error);
      throw error;
    }
  })
);

// Admin: Update user
router.put('/:id',
  authMiddleware.authenticate,
  authMiddleware.authorize(['admin']),
  validateRequest(updateUserSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: targetUserId } = req.params;
    const updateData = req.body;
    const adminUserId = req.user!.id;

    try {
      // Don't allow admin to change their own role
      if (targetUserId === adminUserId && updateData.role) {
        throw new ValidationError('Cannot change your own role');
      }

      const updatedUser = await db.users()
        .where('id', targetUserId)
        .update({
          ...updateData,
          updated_at: new Date()
        })
        .returning([
          'id', 'email', 'username', 'full_name', 'role', 
          'is_active', 'updated_at'
        ]);

      if (!updatedUser || updatedUser.length === 0) {
        throw new NotFoundError('User');
      }

      logger.logAudit('User updated', adminUserId, 'user', {
        targetUserId,
        changes: updateData
      });

      sendResponse(res, 200, true, 'User updated successfully', {
        user: updatedUser[0]
      });
    } catch (error) {
      logger.error('Admin update user error:', error);
      throw error;
    }
  })
);

// Admin: Deactivate user
router.delete('/:id',
  authMiddleware.authenticate,
  authMiddleware.authorize(['admin']),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: targetUserId } = req.params;
    const adminUserId = req.user!.id;

    try {
      // Don't allow admin to deactivate themselves
      if (targetUserId === adminUserId) {
        throw new ValidationError('Cannot deactivate your own account');
      }

      const updatedUser = await db.users()
        .where('id', targetUserId)
        .update({
          is_active: false,
          updated_at: new Date()
        })
        .returning(['id', 'username', 'full_name']);

      if (!updatedUser || updatedUser.length === 0) {
        throw new NotFoundError('User');
      }

      logger.logAudit('User deactivated', adminUserId, 'user', {
        targetUserId,
        username: updatedUser[0].username
      });

      sendResponse(res, 200, true, 'User deactivated successfully');
    } catch (error) {
      logger.error('Admin deactivate user error:', error);
      throw error;
    }
  })
);

// Get user's teams
router.get('/:id/teams',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: targetUserId } = req.params;
    const currentUserId = req.user!.id;
    const currentUserRole = req.user!.role;

    try {
      // Check permissions
      if (currentUserId !== targetUserId && currentUserRole !== 'admin') {
        throw new AuthorizationError('Cannot view other user\'s teams');
      }

      const teams = await db.teamMembers()
        .join('teams', 'team_members.team_id', 'teams.id')
        .where('team_members.user_id', targetUserId)
        .select([
          'teams.id', 'teams.name', 'teams.description', 
          'team_members.role as member_role', 'team_members.created_at as joined_at'
        ]);

      sendResponse(res, 200, true, 'User teams retrieved successfully', {
        teams
      });
    } catch (error) {
      logger.error('Get user teams error:', error);
      throw error;
    }
  })
);

// Get user's activity
router.get('/:id/activity',
  authMiddleware.authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id: targetUserId } = req.params;
    const currentUserId = req.user!.id;
    const currentUserRole = req.user!.role;
    const { page = 1, limit = 20 } = req.query;

    try {
      // Check permissions
      const canViewActivity = currentUserId === targetUserId || 
                             currentUserRole === 'admin' || 
                             await areUsersInSameTeam(currentUserId, targetUserId);

      if (!canViewActivity) {
        throw new AuthorizationError('Cannot view user activity');
      }

      // Get recent issues
      const recentIssues = await db.issues()
        .where('user_id', targetUserId)
        .orderBy('created_at', 'desc')
        .limit(10)
        .select(['id', 'title', 'status', 'created_at']);

      // Get recent recordings
      const recentRecordings = await db.recordings()
        .where('user_id', targetUserId)
        .orderBy('created_at', 'desc')
        .limit(10)
        .select(['id', 'title', 'status', 'created_at']);

      sendResponse(res, 200, true, 'User activity retrieved successfully', {
        activity: {
          recentIssues,
          recentRecordings
        }
      });
    } catch (error) {
      logger.error('Get user activity error:', error);
      throw error;
    }
  })
);

// Helper functions
async function processAndSaveAvatar(buffer: Buffer, userId: string): Promise<string> {
  try {
    // Process image with sharp
    const processedBuffer = await sharp(buffer)
      .resize(200, 200, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality: 90,
        progressive: true
      })
      .toBuffer();

    // In a real implementation, you would upload to S3, CloudFront, etc.
    // For now, we'll save to local filesystem
    const fs = require('fs').promises;
    const path = require('path');
    
    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    const avatarsDir = path.join(uploadsDir, 'avatars');
    
    // Ensure directory exists
    await fs.mkdir(avatarsDir, { recursive: true });
    
    const filename = `${userId}-${Date.now()}.jpg`;
    const filepath = path.join(avatarsDir, filename);
    
    await fs.writeFile(filepath, processedBuffer);
    
    return `/uploads/avatars/${filename}`;
  } catch (error) {
    logger.error('Avatar processing error:', error);
    throw new Error('Failed to process avatar');
  }
}

async function getUserStats(userId: string, publicOnly: boolean = false) {
  try {
    const stats: any = {
      issuesCreated: await db.issues().where('user_id', userId).count('* as count').first(),
      recordingsCreated: await db.recordings().where('user_id', userId).count('* as count').first()
    };

    // Convert count results
    stats.issuesCreated = parseInt(stats.issuesCreated.count);
    stats.recordingsCreated = parseInt(stats.recordingsCreated.count);

    if (!publicOnly) {
      // Add more detailed stats for full profile access
      const issuesByStatus = await db.issues()
        .where('user_id', userId)
        .groupBy('status')
        .select('status')
        .count('* as count');

      stats.issuesByStatus = issuesByStatus.reduce((acc: any, item: any) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {});

      const recordingsByStatus = await db.recordings()
        .where('user_id', userId)
        .groupBy('status')
        .select('status')
        .count('* as count');

      stats.recordingsByStatus = recordingsByStatus.reduce((acc: any, item: any) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {});
    }

    return stats;
  } catch (error) {
    logger.error('Get user stats error:', error);
    return {};
  }
}

async function areUsersInSameTeam(userId1: string, userId2: string): Promise<boolean> {
  try {
    const commonTeams = await db.teamMembers()
      .where('user_id', userId1)
      .whereIn('team_id', 
        db.teamMembers()
          .where('user_id', userId2)
          .select('team_id')
      )
      .count('* as count')
      .first();

    return parseInt(commonTeams?.count as string || '0') > 0;
  } catch (error) {
    logger.error('Check same team error:', error);
    return false;
  }
}

export { router as userRouter };