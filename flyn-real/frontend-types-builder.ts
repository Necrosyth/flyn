// frontend/src/types/builder.ts
export interface Project {
  id: string;
  name: string;
  description?: string;
  slug: string;
  mode: BuilderMode;
  pages: Page[];
  isPublic: boolean;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Page {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description?: string;
  components: Component[];
  content: Record<string, any>;
  seoMetadata?: SEOMetadata;
  status: PageStatus;
  cmsSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Component {
  id: string;
  projectId: string;
  pageId: string;
  name: string;
  type: string;
  props: Record<string, any>;
  styles: Record<string, any>;
  content: Record<string, any>;
  parentId?: string;
  children?: Component[];
  cmsComponentId?: string;
  cmsSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SEOMetadata {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterCard?: string;
}

export enum BuilderMode {
  WEBSITE = 'WEBSITE',
  COMMUNITY = 'COMMUNITY',
  MARKETPLACE = 'MARKETPLACE',
  MEMBERSHIP = 'MEMBERSHIP',
  BLANK = 'BLANK',
  APP = 'APP',
}

export enum PageStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export type CodeFramework = 
  | 'nextjs' | 'vue' | 'html' | 'svelte' | 'angular' 
  | 'php' | 'python' | 'go' | 'ruby' 
  | 'react-native' | 'ios' | 'android';

export type DeploymentPlatform =
  | 'cloudflare_pages'
  | 'vercel'
  | 'aws_amplify'
  | 'netlify'
  | 'heroku'
  | 'docker'
  | 'custom';
