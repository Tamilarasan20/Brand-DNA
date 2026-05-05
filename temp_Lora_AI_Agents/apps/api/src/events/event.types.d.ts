export declare const KAFKA_TOPICS: {
    readonly CONTENT_CREATED: "loraloop.content.created";
    readonly CONTENT_UPDATED: "loraloop.content.updated";
    readonly POST_SCHEDULED: "loraloop.post.scheduled";
    readonly POST_PUBLISHED: "loraloop.post.published";
    readonly POST_FAILED: "loraloop.post.failed";
    readonly ANALYTICS_UPDATED: "loraloop.analytics.updated";
    readonly TREND_DETECTED: "loraloop.trend.detected";
    readonly ENGAGEMENT_RECEIVED: "loraloop.engagement.received";
    readonly ENGAGEMENT_REPLIED: "loraloop.engagement.replied";
    readonly CONNECTION_REFRESHED: "loraloop.connection.refreshed";
    readonly CONNECTION_REVOKED: "loraloop.connection.revoked";
    readonly AGENT_TASK_CREATED: "loraloop.agent.task.created";
    readonly AGENT_TASK_COMPLETED: "loraloop.agent.task.completed";
    readonly BRAND_KNOWLEDGE_UPDATED: "loraloop.brand.knowledge.updated";
    readonly MEDIA_PROCESSED: "loraloop.media.processed";
};
export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
export interface BaseEvent {
    eventId: string;
    eventType: string;
    version: string;
    timestamp: string;
    source: string;
    correlationId?: string;
    userId?: string;
    brandId?: string;
}
export interface ContentCreatedEvent extends BaseEvent {
    eventType: 'content.created';
    payload: {
        contentId: string;
        userId: string;
        brandId: string;
        targetPlatforms: string[];
        agentId?: string;
        rawCaption: string;
        mediaCount: number;
    };
}
export interface ContentUpdatedEvent extends BaseEvent {
    eventType: 'content.updated';
    payload: {
        contentId: string;
        userId: string;
        brandId: string;
        changedFields: string[];
    };
}
export interface PostScheduledEvent extends BaseEvent {
    eventType: 'post.scheduled';
    payload: {
        scheduledPostId: string;
        contentId: string;
        userId: string;
        platform: string;
        scheduledFor: string;
        bullJobId: string;
    };
}
export interface PostPublishedEvent extends BaseEvent {
    eventType: 'post.published';
    payload: {
        publishedPostId: string;
        scheduledPostId: string;
        contentId: string;
        userId: string;
        platform: string;
        platformPostId: string;
        publishedAt: string;
        postUrl?: string;
    };
}
export interface PostFailedEvent extends BaseEvent {
    eventType: 'post.failed';
    payload: {
        scheduledPostId: string;
        contentId: string;
        userId: string;
        platform: string;
        error: string;
        attempt: number;
        willRetry: boolean;
    };
}
export interface AnalyticsUpdatedEvent extends BaseEvent {
    eventType: 'analytics.updated';
    payload: {
        publishedPostId: string;
        platform: string;
        userId: string;
        metrics: {
            impressions?: number;
            reach?: number;
            likes?: number;
            comments?: number;
            shares?: number;
            saves?: number;
            clicks?: number;
            videoViews?: number;
            engagementRate?: number;
        };
        capturedAt: string;
    };
}
export interface TrendDetectedEvent extends BaseEvent {
    eventType: 'trend.detected';
    payload: {
        trendId: string;
        platforms: string[];
        keywords: string[];
        hashtags: string[];
        trendScore: number;
        peakTime?: string;
        category?: string;
        detectedAt: string;
    };
}
export interface EngagementReceivedEvent extends BaseEvent {
    eventType: 'engagement.received';
    payload: {
        engagementItemId: string;
        publishedPostId: string;
        platform: string;
        userId: string;
        type: string;
        authorId?: string;
        authorUsername?: string;
        content?: string;
        sentiment?: string;
        sentimentScore?: number;
        escalated: boolean;
    };
}
export interface EngagementRepliedEvent extends BaseEvent {
    eventType: 'engagement.replied';
    payload: {
        engagementItemId: string;
        replyText: string;
        repliedBy: 'AI' | 'HUMAN';
        agentId?: string;
        repliedAt: string;
    };
}
export interface ConnectionRefreshedEvent extends BaseEvent {
    eventType: 'connection.refreshed';
    payload: {
        connectionId: string;
        platform: string;
        userId: string;
        expiresAt: string;
    };
}
export interface ConnectionRevokedEvent extends BaseEvent {
    eventType: 'connection.revoked';
    payload: {
        connectionId: string;
        platform: string;
        userId: string;
        reason: string;
    };
}
export interface AgentTaskCreatedEvent extends BaseEvent {
    eventType: 'agent.task.created';
    payload: {
        taskId: string;
        agentType: 'CLARA' | 'SARAH' | 'MARK';
        userId: string;
        brandId: string;
        taskType: string;
        input: Record<string, unknown>;
        priority: number;
    };
}
export interface AgentTaskCompletedEvent extends BaseEvent {
    eventType: 'agent.task.completed';
    payload: {
        taskId: string;
        agentType: 'CLARA' | 'SARAH' | 'MARK';
        userId: string;
        durationMs: number;
        outputSummary: string;
        tokensUsed?: number;
    };
}
export interface BrandKnowledgeUpdatedEvent extends BaseEvent {
    eventType: 'brand.knowledge.updated';
    payload: {
        brandId: string;
        userId: string;
        changedFields: string[];
    };
}
export interface MediaProcessedEvent extends BaseEvent {
    eventType: 'media.processed';
    payload: {
        mediaAssetId: string;
        userId: string;
        r2Key: string;
        r2Url: string;
        mimeType: string;
        fileSize: number;
        width?: number;
        height?: number;
        durationSec?: number;
    };
}
export type LoraEvent = ContentCreatedEvent | ContentUpdatedEvent | PostScheduledEvent | PostPublishedEvent | PostFailedEvent | AnalyticsUpdatedEvent | TrendDetectedEvent | EngagementReceivedEvent | EngagementRepliedEvent | ConnectionRefreshedEvent | ConnectionRevokedEvent | AgentTaskCreatedEvent | AgentTaskCompletedEvent | BrandKnowledgeUpdatedEvent | MediaProcessedEvent;
//# sourceMappingURL=event.types.d.ts.map