// types/builder.ts
/**
 * FlyNAI Builder TypeScript Interfaces
 * Complete type definitions for the builder system
 */

export type BuilderMode = 'website' | 'community' | 'marketplace' | 'membership' | 'blank' | 'app';
export type DeploymentPlatform = 'cloudflare' | 'vercel' | 'aws' | 'netlify' | 'docker' | 'appstore' | 'googleplay';
export type Framework = 'nextjs' | 'vue' | 'html' | 'svelte' | 'angular' | 'php' | 'python' | 'go' | 'ruby' | 'react-native' | 'ios' | 'android';
export type PageStatus = 'draft' | 'published' | 'archived';

/**
 * Builder Project
 */
export interface BuilderProject {
  id: string;
  name: string;
  mode: BuilderMode;
  template?: string;
  domain?: string;
  userId: string;
  primaryColor: string;
  primaryTextColor?: string;
  logoUrl?: string;
  currency: string;
  timezone: string;
  cmsProjectId?: string;
  
  pages: BuilderPage[];
  features: FeatureConfig[];
  metadata: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Builder Page
 */
export interface BuilderPage {
  id: string;
  name: string;
  slug: string;
  projectId: string;
  status: PageStatus;
  
  sections: SectionConfig[];
  components: BuilderComponent[];
  seoMetadata: SEOMetadata;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Section Configuration
 */
export interface SectionConfig {
  id: string;
  type: 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'gallery' | 'custom';
  title?: string;
  description?: string;
  components: string[]; // component IDs
  styles?: Record<string, any>;
}

/**
 * Builder Component
 */
export interface BuilderComponent {
  id: string;
  name: string;
  type: string;
  pageId: string;
  
  props: ComponentProps;
  styles: ComponentStyles;
  content: Record<string, any>;
  events?: Record<string, string>;
  
  cmComponentId?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Component Props
 */
export interface ComponentProps {
  text?: string;
  placeholder?: string;
  href?: string;
  src?: string;
  alt?: string;
  color?: string;
  size?: 'small' | 'medium' | 'large';
  variant?: string;
  disabled?: boolean;
  [key: string]: any;
}

/**
 * Component Styles
 */
export interface ComponentStyles {
  display?: string;
  position?: string;
  width?: string;
  height?: string;
  margin?: string;
  padding?: string;
  backgroundColor?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  borderRadius?: string;
  boxShadow?: string;
  opacity?: number;
  [key: string]: any;
}

/**
 * SEO Metadata
 */
export interface SEOMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonicalUrl?: string;
}

/**
 * Feature Configuration
 */
export interface FeatureConfig {
  featureName: string;
  enabled: boolean;
  config: Record<string, any>;
  projectId: string;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Code Generation Request
 */
export interface GenerateCodeRequest {
  projectId: string;
  framework: Framework;
}

/**
 * Code Generation Response
 */
export interface GenerateCodeResponse {
  projectId: string;
  framework: Framework;
  code: string;
  language: string;
  generatedAt: Date;
  status: 'success' | 'error';
}

/**
 * Deployment Request
 */
export interface DeploymentRequest {
  projectId: string;
  platform: DeploymentPlatform;
  domain?: string;
  credentials?: Record<string, any>;
}

/**
 * Deployment Response
 */
export interface DeploymentResponse {
  projectId: string;
  platform: DeploymentPlatform;
  domain?: string;
  status: 'success' | 'error' | 'pending';
  url?: string;
  deployedAt: Date;
  message?: string;
}

/**
 * Preview Sync Update
 */
export interface PreviewSyncUpdate {
  type: 'pageUpdate' | 'componentAdd' | 'componentUpdate' | 'componentDelete' | 'styleChange';
  projectId: string;
  pageId: string;
  component?: BuilderComponent;
  page?: BuilderPage;
  styles?: Record<string, any>;
  timestamp: Date;
}

/**
 * CMS Sync Payload
 */
export interface CMSSyncPayload {
  action: string;
  projectId?: string;
  pageId?: string;
  componentId?: string;
  [key: string]: any;
}

/**
 * Builder Template
 */
export interface BuilderTemplate {
  id: string;
  name: string;
  description: string;
  mode: BuilderMode;
  category: string;
  thumbnail?: string;
  pages: BuilderPage[];
  components: BuilderComponent[];
}

/**
 * User Session with Builder Permissions
 */
export interface BuilderSession {
  userId: string;
  email: string;
  permissions: {
    canCreateProjects: boolean;
    canEditProjects: boolean;
    canDeleteProjects: boolean;
    canDeployProjects: boolean;
    canGenerateCode: boolean;
  };
}
