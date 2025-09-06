import { DatabaseService } from './database';
import { logger } from '../utils/logger';

export interface DuplicateDetectionRequest {
  title: string;
  description: string;
  projectId: string;
  errorDetails?: {
    type: string;
    message: string;
    stack?: string;
  };
  browserInfo?: {
    url: string;
    userAgent: string;
  };
  labels?: string[];
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  createdAt: Date;
  creator: {
    id: string;
    username: string;
    fullName: string;
  };
  similarityScore: number;
  matchReasons: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  confidence: number;
  candidates: DuplicateCandidate[];
  suggestions: {
    action: 'link' | 'merge' | 'create_new';
    reason: string;
  };
}

export class DuplicateDetectionService {
  private db: DatabaseService;

  // Configuration for similarity thresholds
  private readonly SIMILARITY_THRESHOLDS = {
    HIGH: 0.85,
    MEDIUM: 0.70,
    LOW: 0.55
  };

  // Weight for different similarity factors
  private readonly WEIGHTS = {
    TITLE: 0.3,
    DESCRIPTION: 0.25,
    ERROR_MESSAGE: 0.2,
    URL: 0.1,
    LABELS: 0.1,
    STACK_TRACE: 0.05
  };

  constructor() {
    this.db = new DatabaseService();
  }

  /**
   * Detect duplicate issues
   */
  public async detectDuplicates(request: DuplicateDetectionRequest): Promise<DuplicateDetectionResult> {
    try {
      logger.info('Starting duplicate detection', { 
        projectId: request.projectId,
        title: request.title.substring(0, 50) + '...'
      });

      // Get potential duplicate candidates
      const candidates = await this.findCandidates(request);
      
      if (candidates.length === 0) {
        return {
          isDuplicate: false,
          confidence: 0,
          candidates: [],
          suggestions: {
            action: 'create_new',
            reason: 'No similar issues found'
          }
        };
      }

      // Calculate similarity scores
      const scoredCandidates = await Promise.all(
        candidates.map(candidate => this.calculateSimilarity(request, candidate))
      );

      // Sort by similarity score
      scoredCandidates.sort((a, b) => b.similarityScore - a.similarityScore);

      // Determine if it's a duplicate
      const topCandidate = scoredCandidates[0];
      const isDuplicate = topCandidate.similarityScore >= this.SIMILARITY_THRESHOLDS.MEDIUM;
      
      const result: DuplicateDetectionResult = {
        isDuplicate,
        confidence: topCandidate.similarityScore,
        candidates: scoredCandidates.slice(0, 5), // Return top 5 candidates
        suggestions: this.generateSuggestions(topCandidate.similarityScore, topCandidate)
      };

      logger.info('Duplicate detection completed', {
        isDuplicate,
        candidatesFound: scoredCandidates.length,
        topScore: topCandidate.similarityScore
      });

      return result;
    } catch (error) {
      logger.error('Duplicate detection failed:', error);
      return {
        isDuplicate: false,
        confidence: 0,
        candidates: [],
        suggestions: {
          action: 'create_new',
          reason: 'Duplicate detection failed'
        }
      };
    }
  }

  /**
   * Find potential duplicate candidates
   */
  private async findCandidates(request: DuplicateDetectionRequest): Promise<any[]> {
    try {
      // Build search query for potential duplicates
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let query = this.db.getConnection()('issues')
        .leftJoin('users', 'issues.user_id', 'users.id')
        .where('issues.project_id', request.projectId)
        .where('issues.status', '!=', 'closed')
        .where('issues.created_at', '>', thirtyDaysAgo) // Only recent issues
        .select([
          'issues.*',
          'users.id as creator_id',
          'users.username as creator_username',
          'users.full_name as creator_name'
        ]);

      // Add text-based search conditions
      const titleKeywords = this.extractKeywords(request.title);
      const descriptionKeywords = this.extractKeywords(request.description);
      
      if (titleKeywords.length > 0) {
        query = query.where(function() {
          titleKeywords.forEach((keyword, index) => {
            if (index === 0) {
              this.where('issues.title', 'ilike', `%${keyword}%`);
            } else {
              this.orWhere('issues.title', 'ilike', `%${keyword}%`);
            }
          });
        });
      }

      // Add error-based search if available
      if (request.errorDetails) {
        query = query.orWhere(function() {
          this.where('issues.metadata->errorDetails->>message', 'ilike', `%${request.errorDetails!.message.substring(0, 100)}%`)
              .orWhere('issues.metadata->errorDetails->>type', request.errorDetails!.type);
        });
      }

      // Add URL-based search if available
      if (request.browserInfo?.url) {
        const urlPath = this.extractUrlPath(request.browserInfo.url);
        if (urlPath) {
          query = query.orWhere('issues.metadata->browserInfo->>url', 'ilike', `%${urlPath}%`);
        }
      }

      const candidates = await query.limit(20); // Limit initial candidates

      return candidates;
    } catch (error) {
      logger.error('Failed to find duplicate candidates:', error);
      return [];
    }
  }

  /**
   * Calculate similarity score between request and candidate
   */
  private async calculateSimilarity(
    request: DuplicateDetectionRequest, 
    candidate: any
  ): Promise<DuplicateCandidate> {
    const scores: { [key: string]: number } = {};
    const matchReasons: string[] = [];

    // Title similarity
    scores.title = this.calculateTextSimilarity(request.title, candidate.title);
    if (scores.title > 0.7) {
      matchReasons.push(`Similar title (${Math.round(scores.title * 100)}% match)`);
    }

    // Description similarity
    scores.description = this.calculateTextSimilarity(request.description, candidate.description);
    if (scores.description > 0.6) {
      matchReasons.push(`Similar description (${Math.round(scores.description * 100)}% match)`);
    }

    // Error message similarity
    scores.errorMessage = 0;
    if (request.errorDetails && candidate.metadata?.errorDetails) {
      scores.errorMessage = this.calculateTextSimilarity(
        request.errorDetails.message,
        candidate.metadata.errorDetails.message
      );
      if (scores.errorMessage > 0.8) {
        matchReasons.push(`Same error message (${Math.round(scores.errorMessage * 100)}% match)`);
      }
    }

    // URL similarity
    scores.url = 0;
    if (request.browserInfo?.url && candidate.metadata?.browserInfo?.url) {
      scores.url = this.calculateUrlSimilarity(
        request.browserInfo.url,
        candidate.metadata.browserInfo.url
      );
      if (scores.url > 0.8) {
        matchReasons.push(`Same URL path (${Math.round(scores.url * 100)}% match)`);
      }
    }

    // Labels similarity
    scores.labels = 0;
    if (request.labels && request.labels.length > 0 && candidate.labels) {
      scores.labels = this.calculateArraySimilarity(request.labels, candidate.labels);
      if (scores.labels > 0.5) {
        matchReasons.push(`Similar labels (${Math.round(scores.labels * 100)}% match)`);
      }
    }

    // Stack trace similarity (if available)
    scores.stackTrace = 0;
    if (request.errorDetails?.stack && candidate.metadata?.errorDetails?.stack) {
      const requestStack = this.normalizeStackTrace(request.errorDetails.stack);
      const candidateStack = this.normalizeStackTrace(candidate.metadata.errorDetails.stack);
      scores.stackTrace = this.calculateTextSimilarity(requestStack, candidateStack);
      if (scores.stackTrace > 0.7) {
        matchReasons.push(`Similar stack trace (${Math.round(scores.stackTrace * 100)}% match)`);
      }
    }

    // Calculate weighted total score
    const totalScore = 
      (scores.title * this.WEIGHTS.TITLE) +
      (scores.description * this.WEIGHTS.DESCRIPTION) +
      (scores.errorMessage * this.WEIGHTS.ERROR_MESSAGE) +
      (scores.url * this.WEIGHTS.URL) +
      (scores.labels * this.WEIGHTS.LABELS) +
      (scores.stackTrace * this.WEIGHTS.STACK_TRACE);

    // Determine confidence level
    let confidence: 'high' | 'medium' | 'low';
    if (totalScore >= this.SIMILARITY_THRESHOLDS.HIGH) {
      confidence = 'high';
    } else if (totalScore >= this.SIMILARITY_THRESHOLDS.MEDIUM) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      id: candidate.id,
      title: candidate.title,
      description: candidate.description,
      status: candidate.status,
      severity: candidate.severity,
      createdAt: new Date(candidate.created_at),
      creator: {
        id: candidate.creator_id,
        username: candidate.creator_username,
        fullName: candidate.creator_name
      },
      similarityScore: totalScore,
      matchReasons,
      confidence
    };
  }

  /**
   * Calculate text similarity using Jaccard similarity
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const words1 = new Set(this.normalizeText(text1).split(' '));
    const words2 = new Set(this.normalizeText(text2).split(' '));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate URL similarity
   */
  private calculateUrlSimilarity(url1: string, url2: string): number {
    try {
      const path1 = this.extractUrlPath(url1);
      const path2 = this.extractUrlPath(url2);
      
      if (!path1 || !path2) return 0;
      
      // Exact path match
      if (path1 === path2) return 1.0;
      
      // Partial path match
      const segments1 = path1.split('/').filter(Boolean);
      const segments2 = path2.split('/').filter(Boolean);
      
      const commonSegments = segments1.filter(segment => segments2.includes(segment));
      const totalSegments = Math.max(segments1.length, segments2.length);
      
      return commonSegments.length / totalSegments;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate array similarity (for labels, tags, etc.)
   */
  private calculateArraySimilarity(arr1: string[], arr2: string[]): number {
    if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return 0;

    const set1 = new Set(arr1.map(item => item.toLowerCase()));
    const set2 = new Set(arr2.map(item => item.toLowerCase()));

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const normalized = this.normalizeText(text);
    const words = normalized.split(' ');
    
    // Filter out common stop words and short words
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'that', 'this', 'it', 'from', 'be', 'are', 'was', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'cannot', 'not', 'no', 'yes', 'an', 'a']);
    
    return words
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10); // Limit to 10 keywords
  }

  /**
   * Extract URL path for comparison
   */
  private extractUrlPath(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalize stack trace for comparison
   */
  private normalizeStackTrace(stackTrace: string): string {
    return stackTrace
      .split('\n')
      .slice(0, 5) // Only compare first 5 lines
      .map(line => line.replace(/:\d+:\d+/g, '')) // Remove line numbers
      .join('\n');
  }

  /**
   * Generate suggestions based on similarity score
   */
  private generateSuggestions(score: number, topCandidate: DuplicateCandidate): { action: 'link' | 'merge' | 'create_new'; reason: string } {
    if (score >= this.SIMILARITY_THRESHOLDS.HIGH) {
      return {
        action: 'link',
        reason: `Very similar to existing issue "${topCandidate.title}". Consider linking or commenting on the existing issue instead.`
      };
    } else if (score >= this.SIMILARITY_THRESHOLDS.MEDIUM) {
      return {
        action: 'merge',
        reason: `Similar to existing issue "${topCandidate.title}". You may want to add additional context to the existing issue or create a new one if this is a different scenario.`
      };
    } else {
      return {
        action: 'create_new',
        reason: 'No similar issues found. This appears to be a new issue.'
      };
    }
  }

  /**
   * Mark issues as duplicates
   */
  public async markAsDuplicate(duplicateId: string, originalId: string, userId: string): Promise<void> {
    try {
      await this.db.getConnection().transaction(async (trx) => {
        // Update duplicate issue status
        await trx('issues')
          .where('id', duplicateId)
          .update({
            status: 'closed',
            metadata: trx.raw(`
              jsonb_set(
                COALESCE(metadata, '{}'),
                '{duplicateOf}',
                ?
              )
            `, [JSON.stringify(originalId)]),
            updated_at: new Date()
          });

        // Add comment linking to original
        await trx('issue_comments').insert({
          id: require('crypto').randomUUID(),
          issue_id: duplicateId,
          user_id: userId,
          content: `This issue has been marked as a duplicate of #${originalId}`,
          is_internal: false,
          created_at: new Date(),
          updated_at: new Date()
        });

        // Add comment to original
        await trx('issue_comments').insert({
          id: require('crypto').randomUUID(),
          issue_id: originalId,
          user_id: userId,
          content: `Duplicate issue #${duplicateId} has been linked to this issue`,
          is_internal: false,
          created_at: new Date(),
          updated_at: new Date()
        });
      });

      logger.info('Issue marked as duplicate', { duplicateId, originalId });
    } catch (error) {
      logger.error('Failed to mark issue as duplicate:', error);
      throw error;
    }
  }

  /**
   * Get duplicate statistics for a project
   */
  public async getDuplicateStats(projectId: string, days: number = 30): Promise<{
    totalIssues: number;
    duplicatesDetected: number;
    duplicateRate: number;
    topDuplicatePatterns: Array<{ pattern: string; count: number }>;
  }> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [totalResult, duplicatesResult] = await Promise.all([
        this.db.getConnection()('issues')
          .where('project_id', projectId)
          .where('created_at', '>', startDate)
          .count('* as count'),
        this.db.getConnection()('issues')
          .where('project_id', projectId)
          .where('created_at', '>', startDate)
          .whereRaw(`metadata->>'duplicateOf' IS NOT NULL`)
          .count('* as count')
      ]);

      const totalIssues = parseInt(totalResult[0].count as string);
      const duplicatesDetected = parseInt(duplicatesResult[0].count as string);
      const duplicateRate = totalIssues > 0 ? duplicatesDetected / totalIssues : 0;

      // Get top duplicate patterns (simplified)
      const patterns = await this.db.getConnection()('issues')
        .where('project_id', projectId)
        .where('created_at', '>', startDate)
        .whereRaw(`metadata->>'duplicateOf' IS NOT NULL`)
        .select('title')
        .limit(10);

      const topDuplicatePatterns = patterns.map((issue, index) => ({
        pattern: issue.title.substring(0, 50) + '...',
        count: 1 // Simplified - would need more complex grouping in real implementation
      }));

      return {
        totalIssues,
        duplicatesDetected,
        duplicateRate,
        topDuplicatePatterns
      };
    } catch (error) {
      logger.error('Failed to get duplicate stats:', error);
      return {
        totalIssues: 0,
        duplicatesDetected: 0,
        duplicateRate: 0,
        topDuplicatePatterns: []
      };
    }
  }
}