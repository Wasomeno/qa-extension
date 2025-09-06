import { DatabaseService } from './database';
import { logger } from '../utils/logger';

export interface AssignmentRule {
  id: string;
  projectId: string;
  priority: number;
  conditions: {
    severity?: string[];
    labels?: string[];
    affectedComponents?: string[];
    keywords?: string[];
    errorTypes?: string[];
  };
  assignTo: {
    type: 'user' | 'team' | 'round_robin' | 'least_busy';
    userId?: string;
    teamId?: string;
    fallbackUserId?: string;
  };
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentContext {
  projectId: string;
  title: string;
  description: string;
  severity: string;
  labels: string[];
  affectedComponents?: string[];
  errorDetails?: {
    type: string;
    message: string;
  };
  browserInfo?: {
    url: string;
    userAgent: string;
  };
}

export interface TeamMemberWorkload {
  userId: string;
  username: string;
  fullName: string;
  currentIssues: number;
  openIssues: number;
  avgResolutionTime: number; // in hours
  expertise: string[];
  availability: 'available' | 'busy' | 'unavailable';
  lastAssigned?: Date;
}

export class AssignmentService {
  private db: DatabaseService;

  constructor() {
    this.db = new DatabaseService();
  }

  /**
   * Auto-assign issue to appropriate team member
   */
  public async autoAssignIssue(context: AssignmentContext): Promise<string | null> {
    try {
      logger.info('Starting auto-assignment process', { 
        projectId: context.projectId,
        severity: context.severity 
      });

      // Get assignment rules for the project (ordered by priority)
      const rules = await this.getAssignmentRules(context.projectId);
      
      if (rules.length === 0) {
        logger.info('No assignment rules found, using fallback assignment');
        return this.getFallbackAssignee(context.projectId);
      }

      // Find the first matching rule
      for (const rule of rules) {
        if (await this.evaluateRule(rule, context)) {
          const assignee = await this.executeAssignment(rule, context);
          if (assignee) {
            logger.info('Issue auto-assigned', { 
              ruleId: rule.id, 
              assigneeId: assignee,
              assignmentType: rule.assignTo.type 
            });
            return assignee;
          }
        }
      }

      // No rules matched, use fallback
      logger.info('No rules matched, using fallback assignment');
      return this.getFallbackAssignee(context.projectId);
    } catch (error) {
      logger.error('Auto-assignment failed:', error);
      return null;
    }
  }

  /**
   * Get assignment rules for a project
   */
  private async getAssignmentRules(projectId: string): Promise<AssignmentRule[]> {
    try {
      const rules = await this.db.getConnection()('assignment_rules')
        .where('project_id', projectId)
        .where('is_active', true)
        .orderBy('priority', 'asc');

      return rules.map(rule => ({
        ...rule,
        conditions: rule.conditions || {},
        assignTo: rule.assign_to || {},
        createdAt: new Date(rule.created_at),
        updatedAt: new Date(rule.updated_at)
      }));
    } catch (error) {
      logger.error('Failed to get assignment rules:', error);
      return [];
    }
  }

  /**
   * Evaluate if a rule matches the issue context
   */
  private async evaluateRule(rule: AssignmentRule, context: AssignmentContext): Promise<boolean> {
    try {
      const { conditions } = rule;

      // Check severity
      if (conditions.severity && conditions.severity.length > 0) {
        if (!conditions.severity.includes(context.severity)) {
          return false;
        }
      }

      // Check labels
      if (conditions.labels && conditions.labels.length > 0) {
        const hasRequiredLabel = conditions.labels.some(label => 
          context.labels.includes(label)
        );
        if (!hasRequiredLabel) {
          return false;
        }
      }

      // Check affected components
      if (conditions.affectedComponents && conditions.affectedComponents.length > 0 && context.affectedComponents) {
        const hasRequiredComponent = conditions.affectedComponents.some(component => 
          context.affectedComponents!.includes(component)
        );
        if (!hasRequiredComponent) {
          return false;
        }
      }

      // Check keywords in title/description
      if (conditions.keywords && conditions.keywords.length > 0) {
        const text = `${context.title} ${context.description}`.toLowerCase();
        const hasRequiredKeyword = conditions.keywords.some(keyword => 
          text.includes(keyword.toLowerCase())
        );
        if (!hasRequiredKeyword) {
          return false;
        }
      }

      // Check error types
      if (conditions.errorTypes && conditions.errorTypes.length > 0 && context.errorDetails) {
        if (!conditions.errorTypes.includes(context.errorDetails.type)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to evaluate assignment rule:', error);
      return false;
    }
  }

  /**
   * Execute the assignment based on rule type
   */
  private async executeAssignment(rule: AssignmentRule, context: AssignmentContext): Promise<string | null> {
    try {
      switch (rule.assignTo.type) {
        case 'user':
          return rule.assignTo.userId || null;
        
        case 'team':
          return this.assignToTeam(rule.assignTo.teamId!, context);
        
        case 'round_robin':
          return this.assignRoundRobin(context.projectId);
        
        case 'least_busy':
          return this.assignToLeastBusy(context.projectId, context);
        
        default:
          logger.warn('Unknown assignment type:', rule.assignTo.type);
          return rule.assignTo.fallbackUserId || null;
      }
    } catch (error) {
      logger.error('Failed to execute assignment:', error);
      return rule.assignTo.fallbackUserId || null;
    }
  }

  /**
   * Assign to team member (least busy in team)
   */
  private async assignToTeam(teamId: string, context: AssignmentContext): Promise<string | null> {
    try {
      const teamMembers = await this.getTeamWorkloads(teamId);
      if (teamMembers.length === 0) return null;

      // Find least busy available team member
      const availableMembers = teamMembers.filter(member => 
        member.availability === 'available'
      );

      if (availableMembers.length === 0) return teamMembers[0].userId;

      // Sort by current workload
      availableMembers.sort((a, b) => a.currentIssues - b.currentIssues);
      return availableMembers[0].userId;
    } catch (error) {
      logger.error('Failed to assign to team:', error);
      return null;
    }
  }

  /**
   * Round-robin assignment
   */
  private async assignRoundRobin(projectId: string): Promise<string | null> {
    try {
      // Get project team members
      const teamMembers = await this.getProjectTeamMembers(projectId);
      if (teamMembers.length === 0) return null;

      // Get last assigned member
      const lastAssignment = await this.db.getConnection()('assignment_history')
        .where('project_id', projectId)
        .orderBy('created_at', 'desc')
        .first();

      let nextIndex = 0;
      if (lastAssignment) {
        const lastIndex = teamMembers.findIndex(member => 
          member.userId === lastAssignment.assigned_to
        );
        nextIndex = (lastIndex + 1) % teamMembers.length;
      }

      return teamMembers[nextIndex].userId;
    } catch (error) {
      logger.error('Failed round-robin assignment:', error);
      return null;
    }
  }

  /**
   * Assign to least busy team member
   */
  private async assignToLeastBusy(projectId: string, context: AssignmentContext): Promise<string | null> {
    try {
      const teamMembers = await this.getProjectTeamWorkloads(projectId);
      if (teamMembers.length === 0) return null;

      // Filter by availability and expertise if possible
      let candidates = teamMembers.filter(member => 
        member.availability === 'available'
      );

      if (candidates.length === 0) {
        candidates = teamMembers;
      }

      // Consider expertise matching
      if (context.affectedComponents && context.affectedComponents.length > 0) {
        const expertCandidates = candidates.filter(member =>
          member.expertise.some(skill => 
            context.affectedComponents!.some(component => 
              component.toLowerCase().includes(skill.toLowerCase())
            )
          )
        );
        
        if (expertCandidates.length > 0) {
          candidates = expertCandidates;
        }
      }

      // Sort by workload (considering both current issues and avg resolution time)
      candidates.sort((a, b) => {
        const scoreA = a.currentIssues + (a.avgResolutionTime / 24); // Normalize to days
        const scoreB = b.currentIssues + (b.avgResolutionTime / 24);
        return scoreA - scoreB;
      });

      return candidates[0].userId;
    } catch (error) {
      logger.error('Failed least-busy assignment:', error);
      return null;
    }
  }

  /**
   * Get fallback assignee (project maintainer or owner)
   */
  private async getFallbackAssignee(projectId: string): Promise<string | null> {
    try {
      const maintainer = await this.db.getConnection()('team_members')
        .join('projects', 'team_members.team_id', 'projects.team_id')
        .where('projects.id', projectId)
        .whereIn('team_members.role', ['owner', 'maintainer'])
        .select('team_members.user_id')
        .first();

      return maintainer?.user_id || null;
    } catch (error) {
      logger.error('Failed to get fallback assignee:', error);
      return null;
    }
  }

  /**
   * Get project team members
   */
  private async getProjectTeamMembers(projectId: string): Promise<{ userId: string; username: string }[]> {
    try {
      const members = await this.db.getConnection()('team_members')
        .join('projects', 'team_members.team_id', 'projects.team_id')
        .join('users', 'team_members.user_id', 'users.id')
        .where('projects.id', projectId)
        .where('team_members.status', 'active')
        .select([
          'team_members.user_id as userId',
          'users.username'
        ]);

      return members;
    } catch (error) {
      logger.error('Failed to get project team members:', error);
      return [];
    }
  }

  /**
   * Get team workloads
   */
  private async getTeamWorkloads(teamId: string): Promise<TeamMemberWorkload[]> {
    try {
      const members = await this.db.getConnection()('team_members')
        .join('users', 'team_members.user_id', 'users.id')
        .where('team_members.team_id', teamId)
        .where('team_members.status', 'active')
        .select([
          'team_members.user_id as userId',
          'users.username',
          'users.full_name as fullName',
          'users.preferences'
        ]);

      const workloads = await Promise.all(
        members.map(async (member) => {
          const [currentIssues, stats] = await Promise.all([
            this.getCurrentIssueCount(member.userId),
            this.getUserStats(member.userId)
          ]);

          return {
            userId: member.userId,
            username: member.username,
            fullName: member.fullName,
            currentIssues: currentIssues.count,
            openIssues: currentIssues.openCount,
            avgResolutionTime: stats.avgResolutionTime,
            expertise: member.preferences?.expertise || [],
            availability: member.preferences?.availability || 'available',
            lastAssigned: stats.lastAssigned
          } as TeamMemberWorkload;
        })
      );

      return workloads;
    } catch (error) {
      logger.error('Failed to get team workloads:', error);
      return [];
    }
  }

  /**
   * Get project team workloads
   */
  private async getProjectTeamWorkloads(projectId: string): Promise<TeamMemberWorkload[]> {
    try {
      const members = await this.db.getConnection()('team_members')
        .join('projects', 'team_members.team_id', 'projects.team_id')
        .join('users', 'team_members.user_id', 'users.id')
        .where('projects.id', projectId)
        .where('team_members.status', 'active')
        .select([
          'team_members.user_id as userId',
          'users.username',
          'users.full_name as fullName',
          'users.preferences'
        ]);

      const workloads = await Promise.all(
        members.map(async (member) => {
          const [currentIssues, stats] = await Promise.all([
            this.getCurrentIssueCount(member.userId),
            this.getUserStats(member.userId)
          ]);

          return {
            userId: member.userId,
            username: member.username,
            fullName: member.fullName,
            currentIssues: currentIssues.count,
            openIssues: currentIssues.openCount,
            avgResolutionTime: stats.avgResolutionTime,
            expertise: member.preferences?.expertise || [],
            availability: member.preferences?.availability || 'available',
            lastAssigned: stats.lastAssigned
          } as TeamMemberWorkload;
        })
      );

      return workloads;
    } catch (error) {
      logger.error('Failed to get project team workloads:', error);
      return [];
    }
  }

  /**
   * Get current issue count for user
   */
  private async getCurrentIssueCount(userId: string): Promise<{ count: number; openCount: number }> {
    try {
      const [result] = await this.db.getConnection()('issues')
        .where('assignee_id', userId)
        .where('status', '!=', 'closed')
        .count('* as count');

      const [openResult] = await this.db.getConnection()('issues')
        .where('assignee_id', userId)
        .whereIn('status', ['submitted', 'in_progress'])
        .count('* as openCount');

      return {
        count: parseInt(result.count as string),
        openCount: parseInt(openResult.openCount as string)
      };
    } catch (error) {
      logger.error('Failed to get current issue count:', error);
      return { count: 0, openCount: 0 };
    }
  }

  /**
   * Get user statistics
   */
  private async getUserStats(userId: string): Promise<{ avgResolutionTime: number; lastAssigned?: Date }> {
    try {
      // Calculate average resolution time from closed issues in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const closedIssues = await this.db.getConnection()('issues')
        .where('assignee_id', userId)
        .where('status', 'closed')
        .where('closed_at', '>', thirtyDaysAgo)
        .select('created_at', 'closed_at');

      let avgResolutionTime = 24; // Default 24 hours
      if (closedIssues.length > 0) {
        const totalTime = closedIssues.reduce((sum, issue) => {
          const created = new Date(issue.created_at).getTime();
          const closed = new Date(issue.closed_at).getTime();
          return sum + (closed - created);
        }, 0);

        avgResolutionTime = totalTime / closedIssues.length / (1000 * 60 * 60); // Convert to hours
      }

      // Get last assignment
      const lastAssignment = await this.db.getConnection()('assignment_history')
        .where('assigned_to', userId)
        .orderBy('created_at', 'desc')
        .first();

      return {
        avgResolutionTime,
        lastAssigned: lastAssignment ? new Date(lastAssignment.created_at) : undefined
      };
    } catch (error) {
      logger.error('Failed to get user stats:', error);
      return { avgResolutionTime: 24 };
    }
  }

  /**
   * Record assignment in history
   */
  public async recordAssignment(
    issueId: string,
    projectId: string,
    assignedTo: string,
    assignedBy: string,
    reason: string
  ): Promise<void> {
    try {
      await this.db.getConnection()('assignment_history').insert({
        id: require('crypto').randomUUID(),
        issue_id: issueId,
        project_id: projectId,
        assigned_to: assignedTo,
        assigned_by: assignedBy,
        reason,
        created_at: new Date(),
        updated_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to record assignment:', error);
    }
  }

  /**
   * Create assignment rule
   */
  public async createAssignmentRule(rule: Omit<AssignmentRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const ruleId = require('crypto').randomUUID();
      
      await this.db.getConnection()('assignment_rules').insert({
        id: ruleId,
        project_id: rule.projectId,
        priority: rule.priority,
        conditions: JSON.stringify(rule.conditions),
        assign_to: JSON.stringify(rule.assignTo),
        is_active: rule.isActive,
        created_by: rule.createdBy,
        created_at: new Date(),
        updated_at: new Date()
      });

      logger.info('Assignment rule created', { ruleId, projectId: rule.projectId });
      return ruleId;
    } catch (error) {
      logger.error('Failed to create assignment rule:', error);
      throw error;
    }
  }

  /**
   * Update assignment rule
   */
  public async updateAssignmentRule(
    ruleId: string, 
    updates: Partial<Omit<AssignmentRule, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const updateData: any = {
        updated_at: new Date()
      };

      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.conditions !== undefined) updateData.conditions = JSON.stringify(updates.conditions);
      if (updates.assignTo !== undefined) updateData.assign_to = JSON.stringify(updates.assignTo);
      if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

      await this.db.getConnection()('assignment_rules')
        .where('id', ruleId)
        .update(updateData);

      logger.info('Assignment rule updated', { ruleId });
    } catch (error) {
      logger.error('Failed to update assignment rule:', error);
      throw error;
    }
  }

  /**
   * Delete assignment rule
   */
  public async deleteAssignmentRule(ruleId: string): Promise<void> {
    try {
      await this.db.getConnection()('assignment_rules')
        .where('id', ruleId)
        .del();

      logger.info('Assignment rule deleted', { ruleId });
    } catch (error) {
      logger.error('Failed to delete assignment rule:', error);
      throw error;
    }
  }
}