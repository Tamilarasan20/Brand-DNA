/**
 * The contract every platform plugin implements.
 *
 * Adding platform N+1 = creating one new file that implements this interface
 * inside `plugins/platforms/<platform>/`.
 */
export interface IPlatformPlugin {
    readonly platformName: string;
    readonly displayName: string;
    readonly version: string;
    readonly supportedFeatures: PlatformFeatures;
    getOAuthUrl(state: string, redirectUri: string): string;
    exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
    refreshToken(refreshToken: string): Promise<OAuthTokens>;
    validateToken(accessToken: string): Promise<boolean>;
    revokeToken(accessToken: string): Promise<void>;
    adaptContent(rawContent: RawContent, brand: BrandContext): AdaptedContent;
    validateContent(content: AdaptedContent): ValidationResult;
    getContentConstraints(): ContentConstraints;
    publish(content: AdaptedContent, credentials: Credentials): Promise<PublishResult>;
    publishCarousel(slides: AdaptedContent[], credentials: Credentials): Promise<PublishResult>;
    publishStory(content: AdaptedContent, credentials: Credentials): Promise<PublishResult>;
    publishVideo(content: AdaptedContent, credentials: Credentials): Promise<PublishResult>;
    deletePost(postId: string, credentials: Credentials): Promise<void>;
    editPost(postId: string, content: Partial<AdaptedContent>, credentials: Credentials): Promise<void>;
    fetchPostAnalytics(postId: string, credentials: Credentials): Promise<PostAnalytics>;
    fetchBulkAnalytics(postIds: string[], credentials: Credentials): Promise<PostAnalytics[]>;
    fetchAccountAnalytics(credentials: Credentials): Promise<AccountAnalytics>;
    fetchAudienceInsights(credentials: Credentials): Promise<AudienceInsights>;
    fetchComments(postId: string, credentials: Credentials): Promise<Comment[]>;
    fetchDMs(credentials: Credentials): Promise<DirectMessage[]>;
    replyToComment(commentId: string, text: string, credentials: Credentials): Promise<ReplyResult>;
    sendDM(recipientId: string, text: string, credentials: Credentials): Promise<void>;
    likeComment(commentId: string, credentials: Credentials): Promise<void>;
    deleteComment(commentId: string, credentials: Credentials): Promise<void>;
    getRateLimitInfo(): RateLimitConfig;
    checkRateLimit(userId: string): Promise<RateLimitStatus>;
    getPostUrl(postId: string, username?: string): string;
    getProfileUrl(username: string): string;
    parseWebhookEvent(payload: unknown): WebhookEvent | null;
    getOptimalPostingTimes(): OptimalTime[];
}
export interface PlatformFeatures {
    publishing: boolean;
    scheduling: boolean;
    analytics: boolean;
    engagement: boolean;
    dms: boolean;
    stories: boolean;
    reels: boolean;
    carousels: boolean;
    videos: boolean;
    webhooks: boolean;
}
export interface MediaAsset {
    type: 'image' | 'video' | 'document' | 'audio';
    url: string;
    altText?: string;
    duration?: number;
    width?: number;
    height?: number;
    mimeType?: string;
    fileSize?: number;
}
export interface RawContent {
    caption: string;
    headline?: string;
    hook?: string;
    cta?: string;
    script?: string;
    mediaAssets: MediaAsset[];
    hashtags?: string[];
    mentions?: string[];
}
export interface BrandContext {
    tone: string;
    voiceCharacteristics: string[];
    prohibitedWords: string[];
    preferredHashtags: string[];
    brandName: string;
}
export interface AdaptedContent {
    caption: string;
    media: MediaAsset[];
    hashtags: string[];
    mentions: string[];
    firstComment?: string;
    location?: {
        name: string;
        id?: string;
    };
    metadata: Record<string, unknown>;
}
export interface ContentConstraints {
    maxCaptionLength: number;
    maxHashtags: number;
    maxMentions: number;
    supportedMediaTypes: string[];
    maxVideoDurationSec: number;
    maxFileSizeMb: number;
    minAspectRatio?: number;
    maxAspectRatio?: number;
    minResolutionPx?: number;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    scopes: string[];
    platformUserId: string;
    platformUsername: string;
    platformDisplayName?: string;
    platformAvatarUrl?: string;
}
export interface Credentials {
    accessToken: string;
    refreshToken?: string;
    platformUserId?: string;
}
export interface PublishResult {
    success: boolean;
    platformPostId: string;
    platformUrl: string;
    publishedAt: Date;
    additionalData?: Record<string, unknown>;
}
export interface PostAnalytics {
    platformPostId: string;
    impressions: number;
    reach: number;
    engagement: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
    videoViews?: number;
    videoWatchTime?: number;
    engagementRate: number;
    fetchedAt: Date;
}
export interface AccountAnalytics {
    followers: number;
    following?: number;
    totalPosts: number;
    avgEngagementRate: number;
    followerGrowth: number;
    profileViews?: number;
    fetchedAt: Date;
}
export interface AudienceInsights {
    hourlyOnlineFollowers: Record<string, number>;
    hourlyEngagementRate: Record<string, number>;
    dailyEngagementMultiplier: Record<string, number>;
    platformRecommendedTimes: Array<{
        hour: number;
        dayOfWeek: number;
        score: number;
    }>;
    followerCount: number;
    topCountries: Array<{
        name: string;
        percentage: number;
    }>;
    topCities?: Array<{
        name: string;
        percentage: number;
    }>;
    topAgeRange?: string;
    topGender?: string;
    genderSplit: {
        male: number;
        female: number;
        other: number;
    };
    avgDailyImpressions: number;
    avgDailyReach: number;
    avgEngagementRate: number;
    fetchedAt: Date;
}
export interface Comment {
    id: string;
    authorId: string;
    authorUsername: string;
    authorAvatar?: string;
    text: string;
    createdAt: Date;
    likes?: number;
    isReply: boolean;
    parentId?: string;
    mediaUrl?: string;
}
export interface DirectMessage {
    id: string;
    senderId: string;
    senderUsername: string;
    text: string;
    mediaUrl?: string;
    createdAt: Date;
    isRead: boolean;
}
export interface ReplyResult {
    replyId: string;
    publishedAt: Date;
}
export interface RateLimitConfig {
    requestsPerHour: number;
    requestsPerDay: number;
    publishPerHour: number;
    publishPerDay: number;
}
export interface RateLimitStatus {
    remaining: number;
    resetAt: Date;
    isLimited: boolean;
}
export interface OptimalTime {
    dayOfWeek: number;
    hourOfDay: number;
    score: number;
}
export interface WebhookEvent {
    type: string;
    postId?: string;
    commentId?: string;
    userId?: string;
    payload: Record<string, unknown>;
}
export declare class NotImplementedError extends Error {
    constructor(platform: string, method: string);
}
//# sourceMappingURL=platform-plugin.interface.d.ts.map