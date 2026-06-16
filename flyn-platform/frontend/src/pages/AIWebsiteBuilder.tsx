import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { websiteBuilderApi } from '@/services/websiteBuilderApi';
import { useWallet } from '@/contexts/WalletContext';
import type { WebsiteTemplate, SavedWebsite, GenerateInput } from '@/services/websiteBuilderApi';
import { websiteCmsApi } from '@/services/websiteCmsApi';
import type { CmsCollection, CmsRecord, CmsField } from '@/services/websiteCmsApi';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { withPlanGate } from "@/components/PlanGate";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppMode = 'library' | 'generate' | 'preview' | 'mywebsites' | 'editor' | 'forms' | 'myforms';

interface EditorSection {
  id:      string;
  label:   string;
  type:    string;
  html:    string;
  visible: boolean;
}

interface ChatMsg {
  role: 'user' | 'ai';
  text: string;
  ts:   number;
}

interface BuildState {
  templateId: string; businessName: string; industry: string; purpose: string;
  description: string; location: string; colorScheme: string; fontStyle: string;
  quality: 'standard' | 'premium'; additionalContext: string;
  features: Record<string, boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_OPTIONS = [
  { key:'members',icon:'👥',label:'Member Registration',desc:'Sign-up forms & member portal' },
  { key:'donations',icon:'💝',label:'Donations & Fundraising',desc:'Goal progress & donation tiers' },
  { key:'volunteers',icon:'🤲',label:'Volunteer Recruitment',desc:'Applications & shift scheduling' },
  { key:'registration',icon:'📋',label:'Event Registration',desc:'Ticketing & attendee forms' },
  { key:'leadCapture',icon:'🎯',label:'Lead Capture',desc:'Email capture & lead magnets' },
  { key:'ecommerce',icon:'🛒',label:'Products / Shop',desc:'Product grid & cart' },
  { key:'blog',icon:'✍️',label:'Blog / News',desc:'Article cards & categories' },
  { key:'booking',icon:'📅',label:'Booking / Scheduling',desc:'Calendar & appointment booking' },
  { key:'gallery',icon:'🖼️',label:'Photo Gallery',desc:'Masonry grid & lightbox' },
  { key:'events',icon:'🎟️',label:'Events',desc:'Upcoming events & RSVP' },
  { key:'testimonials',icon:'⭐',label:'Testimonials',desc:'Reviews & star ratings' },
  { key:'pricing',icon:'💰',label:'Pricing Plans',desc:'Tier comparison & toggle' },
  { key:'team',icon:'🏢',label:'Team / Staff',desc:'Bio cards & social links' },
  { key:'faq',icon:'❓',label:'FAQ Section',desc:'Accordion Q&A' },
  { key:'contact',icon:'📬',label:'Contact Form',desc:'Form + map + info' },
  { key:'newsletter',icon:'📧',label:'Newsletter Signup',desc:'Email capture banner' },
  { key:'portfolio',icon:'💼',label:'Portfolio / Work',desc:'Project grid & case studies' },
  { key:'stats',icon:'📊',label:'Stats / Numbers',desc:'Animated counter section' },
];

const COLOR_PRESETS = [
  { label:'Professional Blue',value:'deep navy blue with gold accents' },
  { label:'Emerald Green',value:'rich emerald green and white with dark gray' },
  { label:'Warm Terracotta',value:'warm terracotta and sage green' },
  { label:'Bold Purple',value:'bold purple gradient with white' },
  { label:'Clean Minimal',value:'clean white and charcoal gray' },
  { label:'Luxury Black',value:'premium black and gold' },
  { label:'Vibrant Orange',value:'energetic orange and deep navy' },
  { label:'Ocean Blue',value:'ocean teal and sandy cream' },
  { label:'Rose Pink',value:'romantic blush pink and rose gold' },
  { label:'Forest Dark',value:'dark forest green and warm amber' },
];

const FONT_PRESETS = [
  { label:'Modern Sans',value:'modern geometric sans-serif (like Inter or Plus Jakarta Sans)' },
  { label:'Elegant Serif',value:'elegant display serif for headings with clean body sans-serif' },
  { label:'Bold Impact',value:'bold condensed sans for headings with open body font' },
  { label:'Luxury Script',value:'refined script for accents with high-contrast body serif' },
  { label:'Tech Clean',value:'sharp technical monospace-inspired sans' },
  { label:'Warm Friendly',value:'rounded friendly sans-serif throughout' },
];

const SECTION_ICONS: Record<string, string> = {
  nav:'🔗', header:'📐', hero:'🌟', features:'⚡', benefits:'⚡', about:'ℹ️',
  testimonials:'⭐', reviews:'⭐', pricing:'💰', faq:'❓', contact:'📬',
  gallery:'🖼️', team:'👥', blog:'✍️', footer:'🔖', stats:'📊', cta:'🎯',
  newsletter:'📧', booking:'📅', events:'🎟️', portfolio:'💼', ecommerce:'🛒',
  main:'📄', section:'📄', article:'📄',
};

const DEFAULT_SUGGESTIONS = [
  "Change the primary color to emerald green",
  "Make the hero headline more compelling",
  "Add a FAQ section with 5 questions",
  "Change CTA buttons to 'Get Started Free'",
  "Make the design darker and professional",
  "Add more social proof and testimonials",
];

const DEFAULT_BUILD: BuildState = {
  templateId:'', businessName:'', industry:'', purpose:'',
  description:'', location:'', colorScheme:'', fontStyle:'',
  quality:'standard', additionalContext:'',
  features: { contact:true, testimonials:true, stats:true },
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function parseHtmlSections(fullHtml: string): { head: string; sections: EditorSection[] } {
  const headMatch = fullHtml.match(/<head[^>]*>[\s\S]*?<\/head>/i);
  const head = headMatch?.[0] ?? '';
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch?.[1] ?? fullHtml;

  const sections: EditorSection[] = [];
  let idx = 0;
  const re = /<(nav|header|section|footer|main|article)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const block = m[0];
    const attrs = m[2] ?? '';
    const tagName = m[1].toLowerCase();
    const idM   = attrs.match(/\bid=["']([^"']+)["']/i);
    const typeM = attrs.match(/\bdata-section-type=["']([^"']+)["']/i);
    const id    = idM?.[1]   ?? `${tagName}-${idx}`;
    const type  = typeM?.[1] ?? tagName;
    const label = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    sections.push({ id, label, type, html: block, visible: true });
    idx++;
  }

  // Fallback: no structural tags found → whole body is one block
  if (sections.length === 0 && body.trim()) {
    sections.push({ id: 'main', label: 'Main Content', type: 'main', html: body.trim(), visible: true });
  }

  return { head, sections };
}

function normalizeHtml(html: string): string {
  if (!html) return html;
  // Fix double-encoded HTML: literal backslash-n stored instead of real newlines
  if (!html.includes('\n') && html.includes('\\n')) {
    html = html.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
  }

  // Remove localStorage/sessionStorage/cookie access to prevent sandbox issues
  html = html.replace(/localStorage\.[^;]+;?/g, '');
  html = html.replace(/sessionStorage\.[^;]+;?/g, '');
  html = html.replace(/document\.cookie\s*=[^;]+;?/g, '');

  // Remove external SDK scripts that may try to escape sandbox
  html = html.replace(/<script[^>]*src=["']https?:\/\/[^"']*\b(tracker|analytics|crm|sdk)[^"']*["'][^>]*><\/script>/gi, '');

  return html;
}

function assembleCleanHtml(head: string, sections: EditorSection[]): string {
  const body = sections.filter(s => s.visible).map(s => s.html).join('\n\n');
  if (!head) return `<!DOCTYPE html><html lang="en"><body>${body}</body></html>`;
  return `<!DOCTYPE html>\n<html lang="en">\n${head}\n<body>\n${body}\n</body>\n</html>`;
}

function assembleLiveHtml(head: string, sections: EditorSection[]): string {
  const body = sections.filter(s => s.visible).map(s => s.html).join('\n\n');
  const script = `<script>
(function(){
  var style=document.createElement('style');
  style.textContent='[data-wb-sel]{outline:3px solid #6366f1!important;outline-offset:-1px!important;cursor:pointer!important;}';
  document.head.appendChild(style);
  document.addEventListener('click',function(e){
    var el=e.target;
    while(el&&el!==document.body){
      if(el.id){window.parent.postMessage({type:'wb_click',id:el.id},'*');return;}
      el=el.parentElement;
    }
  },{passive:true});
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='wb_highlight')return;
    document.querySelectorAll('[data-wb-sel]').forEach(function(x){x.removeAttribute('data-wb-sel');});
    if(e.data.id){var t=document.getElementById(e.data.id);if(t){t.setAttribute('data-wb-sel','1');t.scrollIntoView({behavior:'smooth',block:'nearest'});}}
  });
})();
</script>`;
  if (!head) return `<!DOCTYPE html><html lang="en"><body>${body}${script}</body></html>`;
  return `<!DOCTYPE html>\n<html lang="en">\n${head}\n<body>\n${body}\n${script}\n</body>\n</html>`;
}

function extractTextFields(sectionHtml: string): Array<{ id: string; tag: string; label: string; value: string }> {
  const fields: Array<{ id: string; tag: string; label: string; value: string }> = [];
  let n = 0;
  for (const tag of ['h1','h2','h3','h4','p','button','a','span','li']) {
    const re = new RegExp(`<${tag}[^>]*>([^<]{2,200})</${tag}>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sectionHtml)) !== null && n < 10) {
      const text = m[1].trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
      if (!text || text.startsWith('{') || text.startsWith('<')) continue;
      const label =
        tag==='h1' ? 'Main Headline' : tag==='h2' ? 'Subheadline' :
        tag==='h3'||tag==='h4' ? 'Section Title' : tag==='button'||tag==='a' ? 'Button / Link' :
        tag==='li' ? 'List Item' : 'Paragraph';
      fields.push({ id:`f${n}`, tag, label, value: text });
      n++;
    }
  }
  return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

function AIWebsiteBuilder(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  // ── Page-level state ───────────────────────────────────────────────────────
  const [mode,       setMode]       = useState<AppMode>(
    (location.state as any)?.startMode === 'forms' ? 'forms' : 'library'
  );
  const [templates,  setTemplates]  = useState<WebsiteTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [myWebsites, setMyWebsites] = useState<SavedWebsite[]>([]);
  const [filteredTpl,setFiltered]   = useState<WebsiteTemplate[]>([]);
  const [catFilter,  setCatFilter]  = useState('');
  const [searchQ,    setSearchQ]    = useState('');
  const [loading,    setLoading]    = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');
  const [build,      setBuild]      = useState<BuildState>(DEFAULT_BUILD);
  const [step,       setStep]       = useState(1);
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [activeWebsite, setActiveWebsite] = useState<SavedWebsite | null>(null);
  const [previewMode,   setPreviewMode]   = useState<'desktop'|'tablet'|'mobile'>('desktop');
  const [publishing, setPublishing] = useState(false);
  const [publishUrl,  setPublishUrl]  = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Editor state ───────────────────────────────────────────────────────────
  const [edSections, setEdSections]   = useState<EditorSection[]>([]);
  const [edHead,     setEdHead]       = useState('');
  const [selId,      setSelId]        = useState<string|null>(null);
  const [editTab,    setEditTab]      = useState<'content'|'html'>('content');
  const [dragSrc,    setDragSrc]      = useState<number|null>(null);
  const [dragOver,   setDragOver]     = useState<number|null>(null);
  const [saving,     setSaving]       = useState(false);
  const editorIframeRef = useRef<HTMLIFrameElement>(null);

  // ── Form creator state ────────────────────────────────────────────────────
  const [formPrompt,    setFormPrompt]    = useState('');
  const [formLoading,   setFormLoading]   = useState(false);
  const [generatedForm, setGeneratedForm] = useState<{ html: string; fields: any[] } | null>(null);

  // ── My Websites CMS state ──────────────────────────────────────────────────
  const [myWebsiteTab,   setMyWebsiteTab]   = useState<'sites'|'cms'|'domains'>('sites');
  const [cmsSelectedSite,setCmsSelectedSite] = useState<SavedWebsite|null>(null);
  const [cmsCollections, setCmsCollections] = useState<CmsCollection[]>([]);
  const [cmsLoadingCols, setCmsLoadingCols] = useState(false);
  const [cmsActiveCol,   setCmsActiveCol]   = useState<CmsCollection|null>(null);
  const [cmsRecords,     setCmsRecords]     = useState<CmsRecord[]>([]);
  const [cmsLoadingRecs, setCmsLoadingRecs] = useState(false);
  const [cmsColModal,    setCmsColModal]    = useState(false);
  const [cmsRecordModal, setCmsRecordModal] = useState(false);
  const [cmsSyncing,     setCmsSyncing]     = useState(false);
  // new-collection form
  const [newColName,   setNewColName]   = useState('');
  const [newColSec,    setNewColSec]    = useState('');
  const [newColFields, setNewColFields] = useState<CmsField[]>([{ name:'name', label:'Title', type:'text', required:true }]);
  const [newColSaving, setNewColSaving] = useState(false);
  // new-record form
  const [newRecData,   setNewRecData]   = useState<Record<string,string>>({});
  const [newRecSaving, setNewRecSaving] = useState(false);

  // ── My Forms state ─────────────────────────────────────────────────────────
  const [savedForms, setSavedForms] = useState<Array<{id:string;html:string;fields:any[];prompt:string;createdAt:number}>>(() => {
    try { return JSON.parse(localStorage.getItem('wb_saved_forms') || '[]'); } catch { return []; }
  });
  const [publishedFormUrls, setPublishedFormUrls] = useState<Record<string,string>>(() => {
    try { return JSON.parse(localStorage.getItem('wb_published_form_urls') || '{}'); } catch { return {}; }
  });
  const [publishingFormId, setPublishingFormId] = useState<string|null>(null);
  const [viewingSubmissionsId, setViewingSubmissionsId] = useState<string|null>(null);
  const [formSubmissions, setFormSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatTab,     setChatTab]     = useState<'chat'|'code'>('chat');
  const [chatMsgs,    setChatMsgs]    = useState<ChatMsg[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Proposal & Credits state ──────────────────────────────────────────────
  const [proposalOpen,       setProposalOpen]       = useState(false);
  const [proposalData,       setProposalData]       = useState<any>(null);
  const [proposalChatMsgs,   setProposalChatMsgs]   = useState<ChatMsg[]>([]);
  const [proposalChatInput,  setProposalChatInput]  = useState('');
  const [proposalChatLoading,setProposalChatLoading]= useState(false);
  const [needsCreditsModal,  setNeedsCreditsModal]  = useState(false);
  const [creditsModalData,   setCreditsModalData]   = useState<{required: number; available: number} | null>(null);
  const [showAddCreditsDialog, setShowAddCreditsDialog] = useState(false);
  const [addCreditsAmount,   setAddCreditsAmount]   = useState(1);
  const proposalChatEndRef = useRef<HTMLDivElement>(null);

  // Use global wallet context instead of local credits state
  const { balance: walletBalance, refresh: refreshWallet } = useWallet();

  const chatSuggestions = useMemo(() => {
    if (!selId) return DEFAULT_SUGGESTIONS;
    const s = edSections.find(x => x.id === selId);
    if (!s) return DEFAULT_SUGGESTIONS;
    const name = s.label.toLowerCase();
    return [
      `Rewrite the ${name} to be more professional`,
      `Add a new button to the ${name}`,
      `Change the colors of the ${name}`,
      `Make the ${name} section taller`,
      `Improve the layout of the ${name}`,
      `Add more detail to the ${name}`,
    ];
  }, [selId, edSections]);

  // ── Live editor HTML (with click-tracking script injected) ─────────────────
  const editorLiveHtml = useMemo(
    () => mode === 'editor' && edSections.length > 0
      ? assembleLiveHtml(edHead, edSections)
      : '',
    [mode, edSections, edHead],
  );

  // ── Highlight selected section inside editor iframe ────────────────────────
  useEffect(() => {
    editorIframeRef.current?.contentWindow?.postMessage({ type:'wb_highlight', id: selId }, '*');
  }, [selId]);

  // ── Listen for section clicks from iframe ──────────────────────────────────
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'wb_click') setSelId(e.data.id as string);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Scroll chat to bottom on new message ──────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs, chatLoading]);

  // ── Scroll to top on navigation ───────────────────────────────────────────
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [mode, step]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, siteRes, draftRes] = await Promise.all([
        websiteBuilderApi.listTemplates(),
        websiteBuilderApi.listWebsites(),
        websiteBuilderApi.getDraftProposal().catch(() => null),
      ]);
      setTemplates(tplRes.templates); setFiltered(tplRes.templates);
      setCategories(tplRes.categories); setMyWebsites(siteRes.websites);

      // If there's a draft proposal, restore it
      if (draftRes) {
        setBuild(b => ({ ...b, ...draftRes.buildState }));
        setProposalData(draftRes);
        setProposalOpen(true);
        setMode('generate');
        setStep(3);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // Show page immediately with empty templates, then load data in background
    setLoading(false);
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    let r = templates;
    if (catFilter) r = r.filter(t => t.category === catFilter);
    if (searchQ)   r = r.filter(t =>
      t.name.toLowerCase().includes(searchQ.toLowerCase()) ||
      t.industry.toLowerCase().includes(searchQ.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(searchQ.toLowerCase()))
    );
    setFiltered(r);
  }, [templates, catFilter, searchQ]);

  // ── Actions ───────────────────────────────────────────────────────────────
  function selectTemplate(t: WebsiteTemplate) {
    setBuild(b => ({ ...b, templateId:t.id, industry:t.industry, purpose:t.purpose,
      colorScheme:t.colorHint, fontStyle:t.fontHint, features:{...t.defaultFeatures} }));
    setStep(2); setMode('generate');
  }

  function startFromScratch() { setBuild({ ...DEFAULT_BUILD }); setStep(2); setMode('generate'); }

  async function proposeAndGenerate() {
    if (!build.businessName.trim() || !build.description.trim()) {
      setError('Business name and description are required.'); return;
    }
    setGenerating(true); setError('');
    try {
      // Step 1: Get proposal with token cost
      console.debug('[proposeAndGenerate] Sending proposal request with quality:', build.quality);
      const proposal = await websiteBuilderApi.propose({
        businessName: build.businessName, industry: build.industry || 'Business',
        purpose: build.purpose || 'business website', description: build.description,
        location: build.location, colorScheme: build.colorScheme, fontStyle: build.fontStyle,
        features: build.features, templateId: build.templateId || undefined,
        quality: build.quality, additionalContext: build.additionalContext,
      } as any);
      console.debug('[proposeAndGenerate] Received proposal with credits:', proposal.credits);

      // Show proposal modal for approval
      setProposalData(proposal);
      setProposalOpen(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to create proposal. Please try again.');
    }
    finally { setGenerating(false); }
  }

  async function confirmAndGenerate() {
    if (!proposalData) return;
    setProposalOpen(false);
    setStep(4); setGenerating(true); setError('');
    try {
      // Step 2: Check if user has enough credits
      const currentBalance = walletBalance?.balance ?? 0;
      if (currentBalance < proposalData.credits) {
        setCreditsModalData({ required: proposalData.credits, available: currentBalance });
        setNeedsCreditsModal(true);
        setStep(3);
        setGenerating(false);
        return;
      }

      // Step 3: Generate website (deducts credits)
      const result = await websiteBuilderApi.generate({
        businessName: build.businessName, industry: build.industry || 'Business',
        purpose: build.purpose || 'business website', description: build.description,
        location: build.location, colorScheme: build.colorScheme, fontStyle: build.fontStyle,
        features: build.features, templateId: build.templateId || undefined,
        quality: build.quality, additionalContext: build.additionalContext,
      } as GenerateInput);

      if (!result.html || result.html.trim().length < 100) {
        throw new Error('Generation returned an empty page. Please try again.');
      }

      // Update credits balance
      if (result.remainingBalance !== undefined) {
        refreshWallet();
      }

      setGeneratedHtml(result.html);
      await load();
      const newSite = (await websiteBuilderApi.listWebsites()).websites.find(w => w.id === result.websiteId);
      if (newSite) setActiveWebsite(newSite);
      setMode('preview');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong generating your website. Please try again.');
      setStep(3);
    }
    finally { setGenerating(false); }
  }

  async function refineProposal() {
    if (!proposalChatInput.trim() || !proposalData?.proposalId) return;
    setProposalChatLoading(true);
    try {
      const msg = proposalChatInput;
      setProposalChatMsgs(prev => [...prev, { role: 'user', text: msg, ts: Date.now() }]);
      setProposalChatInput('');

      const result = await websiteBuilderApi.refineProposal(proposalData.proposalId, msg);
      setProposalData(prev => ({ ...prev, proposal: result.proposal, credits: result.credits, currentBalance: result.currentBalance }));
      setProposalChatMsgs(prev => [...prev, { role: 'ai', text: result.proposal, ts: Date.now() }]);
      refreshWallet();
    } catch (e: any) {
      setError(e?.message || 'Failed to refine proposal');
    } finally {
      setProposalChatLoading(false);
    }
  }

  function handleAddCredits() {
    const amount = addCreditsAmount; // Use the amount the user entered
    const cost = amount * 1; // $1 per credit

    // Redirect to billing with preset amount
    navigate(`/settings/billing?creditsPurchase=${amount}&cost=${cost}`);
  }

  async function publishSite() {
    if (!activeWebsite) return;
    setPublishing(true); setError('');
    try {
      const r = await websiteBuilderApi.publish(activeWebsite.id);
      setPublishUrl(r.url); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setPublishing(false); }
  }

  async function downloadHtml() {
    const html = mode === 'editor'
      ? assembleCleanHtml(edHead, edSections)
      : (generatedHtml || activeWebsite?.html || '');
    if (!html) return;
    const blob = new Blob([html], { type:'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${(activeWebsite?.businessName || 'website').replace(/\s+/g,'-').toLowerCase()}.html`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Open editor from preview ──────────────────────────────────────────────
  function openEditor() {
    const html = normalizeHtml(generatedHtml || activeWebsite?.html || '');
    if (!html) return;
    const { head, sections } = parseHtmlSections(html);
    setEdHead(head); setEdSections(sections);
    setSelId(sections[0]?.id ?? null);
    setEditTab('content'); setChatMsgs([]); setChatOpen(false);
    setMode('editor');
  }

  // ── Save editor changes ───────────────────────────────────────────────────
  async function saveEditor() {
    if (!activeWebsite) return;
    setSaving(true);
    try {
      const html = assembleCleanHtml(edHead, edSections);
      await websiteBuilderApi.updateWebsite(activeWebsite.id, { html });
      setGeneratedHtml(html);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  // ── Section drag-drop ─────────────────────────────────────────────────────
  function onSectionDrop(targetIdx: number) {
    if (dragSrc === null || dragSrc === targetIdx) { setDragSrc(null); setDragOver(null); return; }
    const arr = [...edSections];
    const [moved] = arr.splice(dragSrc, 1);
    arr.splice(targetIdx, 0, moved);
    setEdSections(arr); setDragSrc(null); setDragOver(null);
  }

  // ── Section text editing ──────────────────────────────────────────────────
  function updateSectionText(sectionId: string, oldText: string, newText: string) {
    if (!oldText.trim() || oldText === newText) return;
    setEdSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, html: s.html.replace(oldText, newText) } : s
    ));
  }

  // ── Chat revision ─────────────────────────────────────────────────────────
  async function sendChatMessage() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    const newMsgs: ChatMsg[] = [...chatMsgs, { role: 'user', text: msg, ts: Date.now() }];
    setChatInput('');
    setChatMsgs(newMsgs);
    setChatLoading(true);

    try {
      // Use assembled editor sections if available, else fall back to raw preview HTML
      const currentHtml = edSections.length > 0
        ? assembleCleanHtml(edHead, edSections)
        : (generatedHtml || activeWebsite?.html || '');

      const result = await websiteBuilderApi.chat({
        messages: newMsgs,
        html: currentHtml,
        websiteId: activeWebsite?.id,
        selectedId: selId || undefined,
      });

      const { head, sections } = parseHtmlSections(result.html);
      setEdHead(head);
      setEdSections(sections);
      setGeneratedHtml(result.html);
      setChatMsgs(prev => [...prev, { role: 'ai', text: result.reply, ts: Date.now() }]);
    } catch (e) {
      setChatMsgs(prev => [...prev, { role: 'ai', text: `Error: ${(e as Error).message}`, ts: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Floating chat panel (shared between preview + editor) ─────────────────
  function renderFloatingChat() {
    const currentHtml = edSections.length > 0
      ? assembleCleanHtml(edHead, edSections)
      : (generatedHtml || activeWebsite?.html || '');

    return (
      <div style={{ position:'fixed', bottom:20, right:20, zIndex:1000 }}>
        {/* Theme-aware styles injected so they work in both light and dark mode */}
        <style>{`
          .wb-chat {
            background: #ffffff;
            border: 1px solid rgba(0,0,0,0.1);
            box-shadow: 0 12px 48px rgba(0,0,0,0.18);
          }
          html.dark .wb-chat, [data-theme="dark"] .wb-chat {
            background: #1c1d2e !important;
            border-color: rgba(255,255,255,0.08) !important;
            box-shadow: 0 12px 48px rgba(0,0,0,0.65) !important;
          }
          .wb-chat-hdr { border-bottom: 1px solid rgba(0,0,0,0.08); }
          html.dark .wb-chat-hdr, [data-theme="dark"] .wb-chat-hdr { border-bottom-color: rgba(255,255,255,0.07) !important; }
          .wb-chat-inp-row { border-top: 1px solid rgba(0,0,0,0.07); }
          html.dark .wb-chat-inp-row, [data-theme="dark"] .wb-chat-inp-row { border-top-color: rgba(255,255,255,0.07) !important; }
          .wb-chat-t1 { color: #0f172a; }
          html.dark .wb-chat-t1, [data-theme="dark"] .wb-chat-t1 { color: #e2e8f0 !important; }
          .wb-chat-t2 { color: #64748b; }
          html.dark .wb-chat-t2, [data-theme="dark"] .wb-chat-t2 { color: #94a3b8 !important; }
          .wb-chat-bubble-ai { background: rgba(0,0,0,0.05); }
          html.dark .wb-chat-bubble-ai, [data-theme="dark"] .wb-chat-bubble-ai { background: rgba(255,255,255,0.08) !important; }
          .wb-chat-inp {
            flex: 1; padding: 8px 12px; border-radius: 10px;
            border: 1px solid rgba(0,0,0,0.12);
            background: rgba(0,0,0,0.04);
            font-family: inherit; font-size: 12px; outline: none; color: #0f172a;
          }
          html.dark .wb-chat-inp, [data-theme="dark"] .wb-chat-inp {
            border-color: rgba(255,255,255,0.1) !important;
            background: rgba(255,255,255,0.06) !important;
            color: #e2e8f0 !important;
          }
          .wb-chat-inp::placeholder { color: #94a3b8; }
          .wb-chat-sugg {
            padding: 7px 10px; border-radius: 9px;
            background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.18);
            cursor: pointer; font-size: 11px; color: #818cf8; margin-bottom: 5px; line-height: 1.4;
          }
          .wb-chat-sugg:hover { background: rgba(99,102,241,0.12); }
        `}</style>

        {chatOpen ? (
          <div className="wb-chat" style={{ width:370, height:520, borderRadius:18, display:'flex', flexDirection:'column' as const, overflow:'hidden' }}>

            {/* ── Header ── */}
            <div className="wb-chat-hdr" style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>🤖</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="wb-chat-t1" style={{ fontSize:13, fontWeight:700 }}>AI Website Assistant</div>
                <div className="wb-chat-t2" style={{ fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                  {selId ? `✏️ ${edSections.find(s => s.id === selId)?.label || selId}` : 'Ask me to revise anything'}
                </div>
              </div>
              {/* Chat / Code toggle */}
              <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:'1px solid rgba(99,102,241,0.3)', flexShrink:0 }}>
                {(['chat','code'] as const).map(tab => (
                  <button key={tab} onClick={() => setChatTab(tab)} style={{ padding:'4px 11px', border:'none', cursor:'pointer', fontSize:11, fontFamily:'inherit', fontWeight:chatTab===tab?700:500, background:chatTab===tab?'#6366f1':'transparent', color:chatTab===tab?'#fff':'#818cf8', transition:'all 0.15s' }}>
                    {tab === 'chat' ? '💬 Chat' : '</> Code'}
                  </button>
                ))}
              </div>
              <button onClick={() => setChatOpen(false)} className="wb-chat-t2" style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, lineHeight:1, padding:'0 2px', flexShrink:0 }}>×</button>
            </div>

            {/* ── Chat Tab ── */}
            {chatTab === 'chat' && (
              <>
                <div style={{ flex:1, overflowY:'auto', padding:'10px 12px', display:'flex', flexDirection:'column' as const, gap:6 }}>
                  {chatMsgs.length === 0 && (
                    <div style={{ paddingTop:4 }}>
                      <div style={{ textAlign:'center' as const, marginBottom:14, padding:'8px 0' }}>
                        <div style={{ fontSize:28, marginBottom:6 }}>✨</div>
                        <div className="wb-chat-t1" style={{ fontSize:13, fontWeight:700, marginBottom:3 }}>What would you like to change?</div>
                        <div className="wb-chat-t2" style={{ fontSize:11 }}>I'll revise your entire website instantly.</div>
                      </div>
                      {chatSuggestions.map(s => (
                        <div key={s} className="wb-chat-sugg" onClick={() => setChatInput(s)}>{s}</div>
                      ))}
                    </div>
                  )}
                  {chatMsgs.map((msg, i) => (
                    <div key={i} style={{ display:'flex', justifyContent: msg.role==='user'?'flex-end':'flex-start' }}>
                      <div className={msg.role==='ai' ? 'wb-chat-bubble-ai wb-chat-t1' : ''} style={{
                        maxWidth:'85%', padding:'9px 12px',
                        borderRadius: msg.role==='user'?'14px 14px 3px 14px':'14px 14px 14px 3px',
                        background: msg.role==='user'?'linear-gradient(135deg,#6366f1,#7c3aed)':undefined,
                        color: msg.role==='user'?'#fff':undefined,
                        fontSize:12, lineHeight:1.6,
                      }}>{msg.text}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display:'flex' }}>
                      <div className="wb-chat-bubble-ai" style={{ padding:'9px 12px', borderRadius:'14px 14px 14px 3px' }}>
                        <span className="wb-chat-t2" style={{ fontSize:12 }}>✨ Revising website…</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="wb-chat-inp-row" style={{ padding:'8px 10px', display:'flex', gap:6, flexShrink:0 }}>
                  <input
                    className="wb-chat-inp"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }}}
                    placeholder="Ask AI to change anything…"
                    disabled={chatLoading}
                  />
                  <button onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()} style={{ padding:'8px 16px', borderRadius:10, background:'linear-gradient(135deg,#6366f1,#7c3aed)', border:'none', cursor:'pointer', color:'#fff', fontSize:12, fontWeight:700, flexShrink:0, opacity:chatLoading||!chatInput.trim()?0.5:1 }}>Send</button>
                </div>
              </>
            )}

            {/* ── Code Tab ── */}
            {chatTab === 'code' && (
              <div style={{ flex:1, display:'flex', flexDirection:'column' as const, overflow:'hidden' }}>
                <div style={{ padding:'7px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(99,102,241,0.15)', flexShrink:0, background:'rgba(99,102,241,0.04)' }}>
                  <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.7px', color:'#818cf8', textTransform:'uppercase' as const }}>HTML Source</span>
                  <div style={{ display:'flex', gap:6 }}>
                    <button
                      onClick={() => { const { head, sections } = parseHtmlSections(currentHtml); setEdHead(head); setEdSections(sections); setGeneratedHtml(currentHtml); }}
                      style={{ padding:'3px 9px', borderRadius:6, background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.3)', color:'#10b981', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✓ Apply</button>
                    <button onClick={() => navigator.clipboard.writeText(currentHtml)} style={{ padding:'3px 9px', borderRadius:6, background:'rgba(99,102,241,0.1)', border:'1px solid rgba(99,102,241,0.25)', color:'#818cf8', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Copy</button>
                  </div>
                </div>
                <textarea
                  value={currentHtml}
                  onChange={e => {
                    setGeneratedHtml(e.target.value);
                    const { head, sections } = parseHtmlSections(e.target.value);
                    setEdHead(head); setEdSections(sections);
                  }}
                  spellCheck={false}
                  style={{ flex:1, border:'none', outline:'none', padding:'12px 14px', background:'#0d1117', color:'#e6edf3', fontFamily:"'SF Mono','Fira Code','Cascadia Code',monospace", fontSize:11, lineHeight:1.7, resize:'none' as const }}
                />
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setChatOpen(true)} style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none', cursor:'pointer', fontSize:22, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 24px rgba(99,102,241,0.5)', color:'#fff' }}>
            💬
          </button>
        )}
      </div>
    );
  }

  // ── Form Creator actions ───────────────────────────────────────────────────
  async function generateCustomForm() {
    if (!formPrompt.trim() || formLoading) return;
    setFormLoading(true); setGeneratedForm(null); setError('');
    try {
      const res = await websiteBuilderApi.generateForm({ 
        prompt: formPrompt, 
        businessName: build.businessName || 'My Business' 
      });
      setGeneratedForm(res);
    } catch (e) { setError((e as Error).message); }
    finally { setFormLoading(false); }
  }

  function copyFormHtml() {
    if (!generatedForm?.html) return;
    navigator.clipboard.writeText(generatedForm.html);
    alert('Form HTML copied to clipboard!');
  }

  function saveFormToLibrary() {
    if (!generatedForm) return;
    const entry = { id: `form_${Date.now()}`, html: generatedForm.html, fields: generatedForm.fields, prompt: formPrompt, createdAt: Date.now() };
    const next = [entry, ...savedForms];
    setSavedForms(next);
    localStorage.setItem('wb_saved_forms', JSON.stringify(next));
    alert('Form saved to My Forms!');
  }

  // ── CMS helpers ───────────────────────────────────────────────────────────
  async function loadCmsCollections(site: SavedWebsite) {
    setCmsSelectedSite(site);
    setCmsCollections([]);
    setCmsLoadingCols(true);
    try {
      const cols = await websiteCmsApi.listCollections(site.id);
      setCmsCollections(Array.isArray(cols) ? cols : []);
    } catch {
      setCmsCollections([]);
    } finally {
      setCmsLoadingCols(false);
    }
  }

  async function openCmsRecords(col: CmsCollection) {
    setCmsActiveCol(col);
    setCmsRecords([]);
    setCmsLoadingRecs(true);
    setCmsRecordModal(true);
    try {
      const recs = await websiteCmsApi.listRecords(col.id);
      setCmsRecords(Array.isArray(recs) ? recs : []);
    } catch {
      setCmsRecords([]);
    } finally {
      setCmsLoadingRecs(false);
    }
  }

  async function createCmsCollection() {
    if (!cmsSelectedSite || !newColName || !newColSec) return;
    setNewColSaving(true);
    try {
      const col = await websiteCmsApi.createCollection({
        websiteId: cmsSelectedSite.id, sectionId: newColSec, name: newColName,
        slug: newColName.toLowerCase().replace(/\s+/g,'-'),
        fields: newColFields.filter(f => f.name && f.label),
      });
      setCmsCollections(prev => [...prev, col]);
      setCmsColModal(false); setNewColName(''); setNewColSec('');
      setNewColFields([{ name:'name', label:'Title', type:'text', required:true }]);
    } catch { /* ignore */ }
    finally { setNewColSaving(false); }
  }

  async function deleteCmsCollection(id: string) {
    if (!confirm('Delete this collection and all its records?')) return;
    await websiteCmsApi.deleteCollection(id).catch(() => {});
    setCmsCollections(prev => prev.filter(c => c.id !== id));
  }

  async function createCmsRecord() {
    if (!cmsActiveCol) return;
    setNewRecSaving(true);
    try {
      const rec = await websiteCmsApi.createRecord(cmsActiveCol.id, newRecData);
      setCmsRecords(prev => [...prev, rec]); setNewRecData({});
    } catch { /* ignore */ }
    finally { setNewRecSaving(false); }
  }

  async function deleteCmsRecord(id: string) {
    if (!confirm('Delete this record?')) return;
    await websiteCmsApi.deleteRecord(id).catch(() => {});
    setCmsRecords(prev => prev.filter(r => r.id !== id));
  }

  async function syncCmsContent() {
    if (!cmsSelectedSite) return;
    setCmsSyncing(true);
    try {
      const res = await websiteBuilderApi.syncCms(cmsSelectedSite.id);
      if (res.success) {
        setCmsSelectedSite(prev => prev ? { ...prev, html: res.html } : prev);
        alert('Website synced with latest CMS data!');
      }
    } catch { /* ignore */ }
    finally { setCmsSyncing(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function renderFormCreator() {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
        <div style={{ background: 'var(--color-background-primary)', borderRadius: 12, border: '0.5px solid var(--color-border-secondary)', padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>AI Form Creator</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>Describe the form you need, and our AI will build the HTML and CSS for you.</p>
          
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 6, textTransform: 'uppercase' }}>What should this form do?</label>
            <textarea 
              value={formPrompt}
              onChange={e => setFormPrompt(e.target.value)}
              placeholder="e.g. A volunteer application form with fields for name, email, interests (checkboxes), and a 'why do you want to join' textarea."
              rows={4}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: '0.5px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </div>
          
          <Button 
            onClick={generateCustomForm} 
            disabled={formLoading || !formPrompt.trim()}
            style={{ width: '100%' }}
          >
            {formLoading ? '✨ Generating Form...' : '🚀 Generate Form'}
          </Button>
        </div>

        {generatedForm && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Preview */}
            <div style={{ background: '#fff', borderRadius: 12, border: '0.5px solid var(--color-border-secondary)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 11, fontWeight: 700, color: '#64748b' }}>LIVE PREVIEW</div>
              <div style={{ padding: 24 }} dangerouslySetInnerHTML={{ __html: generatedForm.html }} />
            </div>

            {/* Code & Actions */}
            <div style={{ background: 'var(--color-background-primary)', borderRadius: 12, border: '0.5px solid var(--color-border-secondary)', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>Generated Fields</h3>
                <div style={{ display:'flex', gap:6 }}>
                  <Button variant="secondary" size="sm" onClick={saveFormToLibrary}>💾 Save to My Forms</Button>
                  <Button variant="secondary" size="sm" onClick={copyFormHtml}>📋 Copy HTML</Button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {generatedForm.fields.map((f: any, i: number) => (
                  <Badge key={i} variant="outline" style={{ background: 'var(--color-background-secondary)', fontSize: 11 }}>
                    {f.label} ({f.type})
                  </Badge>
                ))}
              </div>
              <p style={{ marginTop: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                You can copy this HTML and paste it into any custom HTML block or your website editor.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMISSIONS MODAL
  // ─────────────────────────────────────────────────────────────────────────
  function renderSubmissionsModal() {
    if (!viewingSubmissionsId) return null;
    const form = savedForms.find(f => f.id === viewingSubmissionsId);
    
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ background:'var(--color-background-primary)', borderRadius:16, padding:24, width:'100%', maxWidth:900, maxHeight:'85vh', display:'flex', flexDirection:'column' as const, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexShrink:0 }}>
            <div>
              <h2 style={{ fontSize:18, fontWeight:700, color:'var(--color-text-primary)' }}>Form Submissions</h2>
              <p style={{ fontSize:12, color:'var(--color-text-tertiary)' }}>{form?.prompt.slice(0, 80)}...</p>
            </div>
            <button onClick={() => setViewingSubmissionsId(null)} style={{ padding:'6px 12px', background:'none', border:'1px solid var(--color-border-secondary)', borderRadius:8, cursor:'pointer', color:'var(--color-text-secondary)', fontSize:13 }}>✕ Close</button>
          </div>

          <div style={{ flex:1, overflow:'auto', borderRadius:10, border:'1px solid var(--color-border-secondary)' }}>
            {loadingSubmissions ? (
              <div style={{ padding:48, textAlign:'center' as const, color:'var(--color-text-tertiary)' }}>Loading submissions…</div>
            ) : formSubmissions.length === 0 ? (
              <div style={{ padding:60, textAlign:'center' as const, color:'var(--color-text-tertiary)' }}>
                <div style={{ fontSize:32, marginBottom:10 }}>📥</div>
                <div style={{ fontWeight:700, marginBottom:4, color:'var(--color-text-primary)' }}>No submissions yet</div>
                <div style={{ fontSize:13 }}>Once users fill out your published form, the data will appear here.</div>
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--color-background-secondary)', borderBottom:'1px solid var(--color-border-tertiary)' }}>
                    <th style={{ padding:'12px 16px', textAlign:'left' as const, fontWeight:700, color:'var(--color-text-tertiary)', textTransform:'uppercase', fontSize:10, letterSpacing:'0.5px' }}>Date</th>
                    {/* Dynamic columns based on form fields */}
                    {form?.fields.map((f: any) => (
                      <th key={f.name} style={{ padding:'12px 16px', textAlign:'left' as const, fontWeight:700, color:'var(--color-text-tertiary)', textTransform:'uppercase', fontSize:10, letterSpacing:'0.5px' }}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {formSubmissions.map((sub, idx) => (
                    <tr key={sub.id || idx} style={{ borderBottom:'1px solid var(--color-border-tertiary)', background: idx % 2 === 0 ? 'transparent' : 'var(--color-background-secondary)' }}>
                      <td style={{ padding:'12px 16px', color:'var(--color-text-tertiary)', whiteSpace:'nowrap' as const }}>
                        {new Date(sub.submittedAt || sub.createdAt).toLocaleString()}
                      </td>
                      {form?.fields.map((f: any) => (
                        <td key={f.name} style={{ padding:'12px 16px', color:'var(--color-text-primary)' }}>
                          {sub.formData?.[f.name] || <span style={{ color:'var(--color-text-tertiary)' }}>–</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          
          <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end' }}>
             <Button variant="secondary" size="sm" onClick={() => {
               const headers = ['Submitted At', ...form?.fields.map((f:any) => f.label)].join(',');
               const rows = formSubmissions.map(s => [
                 new Date(s.submittedAt || s.createdAt).toLocaleString(),
                 ...form?.fields.map((f:any) => `"${(s.formData?.[f.name] || '').replace(/"/g, '""')}"`)
               ].join(','));
               const csv = [headers, ...rows].join('\n');
               const blob = new Blob([csv], { type: 'text/csv' });
               const url = URL.createObjectURL(blob);
               const a = document.createElement('a');
               a.href = url;
               a.download = `submissions-${viewingSubmissionsId}.csv`;
               a.click();
             }}>📥 Download CSV</Button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MY FORMS VIEW
  // ─────────────────────────────────────────────────────────────────────────
  function renderMyForms() {
    if (savedForms.length === 0) {
      return (
        <div style={{ textAlign:'center' as const, padding:'48px 24px', color:'var(--color-text-tertiary)' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
          <div style={{ fontWeight:700, marginBottom:6, fontSize:16, color:'var(--color-text-primary)' }}>No saved forms yet</div>
          <div style={{ fontSize:13, marginBottom:20 }}>Build a form with AI, then save it here to embed anywhere.</div>
          <Button onClick={() => setMode('forms')}>→ Go to Form Builder</Button>
        </div>
      );
    }

    return (
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--color-text-primary)' }}>Saved Forms ({savedForms.length})</div>
          <Button size="sm" onClick={() => setMode('forms')}>+ Build New Form</Button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
          {savedForms.map(form => (
            <div key={form.id} style={{ borderRadius:12, border:'0.5px solid var(--color-border-secondary)', overflow:'hidden', background:'var(--color-background-primary)' }}>
              <div style={{ padding:'10px 14px 8px', background:'var(--color-background-secondary)', borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--color-text-primary)', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{form.prompt.slice(0,60)}{form.prompt.length>60?'…':''}</div>
                <div style={{ fontSize:10, color:'var(--color-text-tertiary)' }}>
                  {form.fields.length} fields · {new Date(form.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ padding:'10px 14px 6px', maxHeight:120, overflow:'hidden', background:'#fff', position:'relative' }}>
                <div style={{ transform:'scale(0.65)', transformOrigin:'top left', pointerEvents:'none' as const }} dangerouslySetInnerHTML={{ __html: form.html }} />
                <div style={{ position:'absolute', bottom:0, left:0, right:0, height:40, background:'linear-gradient(transparent, white)' }} />
              </div>
              {publishedFormUrls[form.id] && (
                <div style={{ padding:'6px 14px', background:'rgba(99,102,241,0.06)', borderTop:'0.5px solid var(--color-border-tertiary)', display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:10, color:'#818cf8', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{publishedFormUrls[form.id]}</span>
                  <button onClick={() => { navigator.clipboard.writeText(publishedFormUrls[form.id]); }} style={{ padding:'3px 8px', borderRadius:5, border:'0.5px solid rgba(99,102,241,0.3)', background:'none', color:'#818cf8', fontFamily:'inherit', fontSize:10, cursor:'pointer', flexShrink:0 }}>Copy Link</button>
                  <a href={publishedFormUrls[form.id]} target="_blank" rel="noreferrer" style={{ padding:'3px 8px', borderRadius:5, border:'0.5px solid rgba(99,102,241,0.3)', background:'none', color:'#818cf8', fontFamily:'inherit', fontSize:10, cursor:'pointer', textDecoration:'none', flexShrink:0 }}>Open ↗</a>
                </div>
              )}
              <div style={{ padding:'10px 14px', display:'flex', gap:6 }}>
                <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const, flex:1 }}>
                   <button 
                     onClick={async () => {
                       setViewingSubmissionsId(form.id);
                       setLoadingSubmissions(true);
                       try {
                         const subs = await websiteBuilderApi.listFormSubmissions(form.id);
                         setFormSubmissions(subs);
                       } catch (e: any) { alert('Failed to load submissions: ' + e.message); }
                       finally { setLoadingSubmissions(false); }
                     }}
                     style={{ fontSize:10, padding:'4px 10px', borderRadius:5, background:'rgba(99,102,241,0.1)', color:'#6366f1', border:'none', cursor:'pointer', fontWeight:700 }}
                   >📈 View Results</button>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button
                    disabled={publishingFormId === form.id}
                    onClick={async () => {
                      setPublishingFormId(form.id);
                      try {
                        const result = await websiteBuilderApi.publishForm(form.id, form.html, form.prompt.slice(0, 60));
                        const next = { ...publishedFormUrls, [form.id]: result.url };
                        setPublishedFormUrls(next);
                        localStorage.setItem('wb_published_form_urls', JSON.stringify(next));
                      } catch (e: any) { alert('Publish failed: ' + e.message); }
                      finally { setPublishingFormId(null); }
                    }}
                    style={{ padding:'4px 10px', borderRadius:7, border:'0.5px solid rgba(99,102,241,0.3)', background:'none', color:'#818cf8', fontFamily:'inherit', fontSize:11, cursor:'pointer' }}
                  >{publishingFormId === form.id ? '…' : publishedFormUrls[form.id] ? '🔗 Re-publish' : '🔗 Publish'}</button>
                  <button onClick={() => { navigator.clipboard.writeText(form.html); alert('HTML copied!'); }} style={{ padding:'4px 10px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:11, cursor:'pointer' }}>📋 Copy HTML</button>
                  <button onClick={() => { if (!confirm('Delete this form?')) return; const next = savedForms.filter(f=>f.id!==form.id); setSavedForms(next); localStorage.setItem('wb_saved_forms', JSON.stringify(next)); }} style={{ padding:'4px 8px', borderRadius:7, border:'0.5px solid rgba(239,68,68,0.3)', background:'none', color:'#ef4444', fontFamily:'inherit', fontSize:11, cursor:'pointer' }}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {renderSubmissionsModal()}
      </div>
    );
  }

  const PREVIEW_W: Record<typeof previewMode, string> = { desktop:'100%', tablet:'768px', mobile:'390px' };
  const tabBtn = (active: boolean) => ({
    display:'inline-block' as const, padding:'7px 16px', border:'none',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    color: active ? '#818cf8' : 'var(--color-text-secondary)', background:'none',
    fontFamily:'inherit', fontSize:13, fontWeight: active ? 600 : 400, cursor:'pointer',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EDITOR MODE
  // ─────────────────────────────────────────────────────────────────────────
  function renderEditor() {
    const selSection = edSections.find(s => s.id === selId) ?? null;
    const textFields = selSection ? extractTextFields(selSection.html) : [];

    return (
      <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 60px)', overflow:'hidden' }}>

        {/* ── Top bar ── */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderBottom:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', flexShrink:0, flexWrap:'wrap' }}>
          <button onClick={() => setMode('preview')} style={{ padding:'5px 12px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>← Preview</button>
          <span style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)' }}>{activeWebsite?.title || 'Website Editor'}</span>
          <Badge variant="outline" style={{ fontSize:10, padding:'1px 8px', color:'#10b981', borderColor:'#10b981' }}>Live editing</Badge>
          <div style={{ flex:1 }} />
          <button onClick={saveEditor} disabled={saving} style={{ padding:'5px 14px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer', opacity: saving?0.6:1 }}>
            {saving ? '…Saving' : '💾 Save'}
          </button>
          <button onClick={downloadHtml} style={{ padding:'5px 14px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>⬇️ Download</button>
          <Button size="sm" onClick={publishSite} disabled={publishing}>
            {publishing ? 'Publishing…' : '🚀 Publish'}
          </Button>
        </div>

        {/* ── Main 3-panel area ── */}
        <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

          {/* LEFT: Section list */}
          <div style={{ width:220, borderRight:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)', display:'flex', flexDirection:'column', overflowY:'auto', flexShrink:0 }}>
            <div style={{ padding:'10px 12px 6px', fontSize:10, fontWeight:700, color:'var(--color-text-tertiary)', textTransform:'uppercase', letterSpacing:'0.8px' }}>Sections</div>

            {edSections.map((sec, idx) => (
              <div
                key={sec.id}
                draggable
                onDragStart={() => setDragSrc(idx)}
                onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                onDrop={() => onSectionDrop(idx)}
                onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                onClick={() => setSelId(sec.id)}
                style={{
                  display:'flex', alignItems:'center', gap:6, padding:'7px 8px',
                  margin:'2px 6px', borderRadius:8, cursor:'pointer',
                  background: selId===sec.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                  border: selId===sec.id ? '0.5px solid rgba(99,102,241,0.35)' : '0.5px solid transparent',
                  borderTop: dragOver===idx && dragSrc!==idx ? '2px solid #6366f1' : undefined,
                  opacity: !sec.visible ? 0.4 : 1,
                  transition:'background 0.1s',
                  userSelect:'none',
                }}
              >
                <span style={{ color:'var(--color-text-tertiary)', fontSize:12, cursor:'grab', flexShrink:0 }}>⠿</span>
                <span style={{ fontSize:14, flexShrink:0 }}>{SECTION_ICONS[sec.type] ?? SECTION_ICONS[sec.id.split('-')[0]] ?? '📄'}</span>
                <span style={{ flex:1, fontSize:11, fontWeight: selId===sec.id?700:400, color:'var(--color-text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sec.label}</span>
                <button
                  onClick={e => { e.stopPropagation(); setEdSections(prev => prev.map(s => s.id===sec.id ? {...s,visible:!s.visible} : s)); }}
                  style={{ padding:'2px 3px', background:'none', border:'none', cursor:'pointer', color:'var(--color-text-tertiary)', fontSize:11, flexShrink:0, lineHeight:1 }}
                  title={sec.visible?'Hide':'Show'}
                >{sec.visible ? '👁' : '🙈'}</button>
                <button
                  onClick={e => { e.stopPropagation(); setEdSections(prev => prev.filter(s => s.id!==sec.id)); if(selId===sec.id) setSelId(null); }}
                  style={{ padding:'2px 3px', background:'none', border:'none', cursor:'pointer', color:'#ef4444', fontSize:11, flexShrink:0, lineHeight:1 }}
                  title="Delete"
                >✕</button>
              </div>
            ))}

            <div style={{ padding:'6px 10px', marginTop:4 }}>
              <button
                onClick={() => { setChatOpen(true); setChatInput('Add a new section: '); }}
                style={{ width:'100%', padding:'8px', borderRadius:8, border:'0.5px dashed var(--color-border-secondary)', background:'none', color:'var(--color-text-tertiary)', fontSize:11, cursor:'pointer', textAlign:'center' as const }}
              >+ Add section via AI</button>
            </div>
          </div>

          {/* CENTER: Live preview */}
          <div style={{ flex:1, overflow:'hidden', background:'#d1d5db', display:'flex', alignItems:'stretch' }}>
            <iframe
              ref={editorIframeRef}
              srcDoc={editorLiveHtml}
              title="Editor Preview"
              style={{ width:'100%', height:'100%', border:'none' }}
              sandbox="allow-scripts allow-same-origin"
            />
          </div>

          {/* RIGHT: Section editor */}
          <div style={{ width:300, borderLeft:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', display:'flex', flexDirection:'column', overflowY:'auto', flexShrink:0 }}>
            {!selSection ? (
              <div style={{ padding:24, textAlign:'center' as const, color:'var(--color-text-tertiary)', marginTop:48 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>👆</div>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Select a section</div>
                <div style={{ fontSize:12 }}>Click any section in the left panel or directly in the preview to edit it.</div>
              </div>
            ) : (
              <>
                {/* Section header */}
                <div style={{ padding:'10px 14px', borderBottom:'0.5px solid var(--color-border-tertiary)', flexShrink:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)', marginBottom:8 }}>
                    {SECTION_ICONS[selSection.type] ?? '📄'} {selSection.label}
                  </div>
                  <div style={{ display:'flex', gap:0, borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
                    {(['content','html'] as const).map(t => (
                      <button key={t} onClick={() => setEditTab(t)} style={{
                        padding:'4px 14px', border:'none', background:'none', cursor:'pointer',
                        fontFamily:'inherit', fontSize:11, fontWeight: editTab===t?700:400,
                        color: editTab===t?'#818cf8':'var(--color-text-secondary)',
                        borderBottom: editTab===t?'2px solid #6366f1':'2px solid transparent',
                      }}>{t==='content'?'Content':'HTML Source'}</button>
                    ))}
                  </div>
                </div>

                {/* Content tab */}
                {editTab === 'content' && (
                  <div style={{ padding:12, display:'flex', flexDirection:'column' as const, gap:10, overflowY:'auto' }}>
                    {textFields.length === 0 ? (
                      <div style={{ fontSize:12, color:'var(--color-text-tertiary)', padding:'12px 0' }}>No text fields detected. Switch to HTML tab to edit the source code directly.</div>
                    ) : textFields.map(field => (
                      <div key={field.id}>
                        <label style={{ display:'block', fontSize:9, fontWeight:700, color:'var(--color-text-tertiary)', marginBottom:3, textTransform:'uppercase' as const, letterSpacing:'0.6px' }}>
                          {field.label} <span style={{ fontWeight:400, textTransform:'none' as const }}>({field.tag})</span>
                        </label>
                        {field.tag === 'p' || field.tag === 'li' ? (
                          <textarea
                            defaultValue={field.value}
                            onBlur={e => updateSectionText(selSection.id, field.value, e.target.value)}
                            rows={2}
                            style={{ width:'100%', padding:'6px 9px', borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:11, resize:'vertical' as const, boxSizing:'border-box' as const }}
                          />
                        ) : (
                          <input
                            defaultValue={field.value}
                            onBlur={e => updateSectionText(selSection.id, field.value, e.target.value)}
                            style={{ width:'100%', padding:'6px 9px', borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:11, boxSizing:'border-box' as const }}
                          />
                        )}
                      </div>
                    ))}
                    <div style={{ marginTop:4, paddingTop:10, borderTop:'0.5px solid var(--color-border-tertiary)' }}>
                      <div style={{ fontSize:10, color:'var(--color-text-tertiary)', marginBottom:6, fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.5px' }}>Need more control?</div>
                      <button onClick={() => setEditTab('html')} style={{ width:'100%', padding:'7px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:11, cursor:'pointer' }}>Edit HTML Source →</button>
                    </div>
                  </div>
                )}

                {/* HTML tab */}
                {editTab === 'html' && (
                  <div style={{ padding:10, flex:1, display:'flex', flexDirection:'column' as const }}>
                    <textarea
                      value={selSection.html}
                      onChange={e => setEdSections(prev => prev.map(s => s.id===selId ? {...s,html:e.target.value} : s))}
                      spellCheck={false}
                      style={{ flex:1, minHeight:400, padding:10, borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'#1a1a2e', color:'#e2e8f0', fontFamily:'monospace', fontSize:11, resize:'none' as const, lineHeight:1.6, boxSizing:'border-box' as const }}
                    />
                    <div style={{ marginTop:6, fontSize:10, color:'var(--color-text-tertiary)' }}>Changes apply live to the preview.</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {renderFloatingChat()}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIBRARY VIEW
  // ─────────────────────────────────────────────────────────────────────────
  function renderLibrary() {
    return (
      <div>
        <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ flex:1, minWidth:200, position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'var(--color-text-tertiary)' }}>🔍</span>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search by industry, purpose, or keyword…"
              style={{ width:'100%', padding:'9px 12px 9px 32px', borderRadius:8, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:13, boxSizing:'border-box' as const }} />
          </div>
          <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{ padding:'9px 12px', borderRadius:8, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:13 }}>
            <option value="">All Industries</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button size="sm" variant="secondary" onClick={startFromScratch}>+ Start from Scratch</Button>
        </div>

        {!searchQ && !catFilter && (
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--color-text-tertiary)', letterSpacing:'0.8px', marginBottom:12, textTransform:'uppercase' as const }}>🔥 Popular Templates</div>
            <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:4 }}>
              {filteredTpl.filter(t=>t.popular).slice(0,8).map(t => (
                <div key={t.id} onClick={()=>selectTemplate(t)} style={{ flexShrink:0, width:200, cursor:'pointer', borderRadius:12, border:'0.5px solid var(--color-border-tertiary)', overflow:'hidden', background:'var(--color-background-primary)', transition:'all 0.2s', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ height:100, overflow:'hidden', position:'relative' }}>
                    <TemplateMockup gradient={getTemplateColor(t.id)} accent={t.id} />
                  </div>
                  <div style={{ padding:'10px 12px' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--color-text-primary)', marginBottom:3 }}>{t.name}</div>
                    <div style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>{t.category}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontSize:11, fontWeight:700, color:'var(--color-text-tertiary)', letterSpacing:'0.8px', marginBottom:12, textTransform:'uppercase' as const }}>
          {filteredTpl.length} Templates {catFilter?`in ${catFilter}`:''} {searchQ?`matching "${searchQ}"` :''}
        </div>
        {filteredTpl.length === 0 ? (
          <div style={{ textAlign:'center' as const, padding:'48px 24px', color:'var(--color-text-tertiary)' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>No templates found</div>
            <div style={{ fontSize:13 }}>Try a different search or browse all categories.</div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:14 }}>
            {filteredTpl.map(t => (
              <div key={t.id} onClick={()=>selectTemplate(t)} style={{ cursor:'pointer', borderRadius:12, border:'0.5px solid var(--color-border-tertiary)', overflow:'hidden', background:'var(--color-background-primary)', transition:'all 0.15s', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ height:120, position:'relative', overflow:'hidden' }}>
                  <TemplateMockup gradient={getTemplateColor(t.id)} accent={t.id} />
                  <div style={{ position:'absolute', top:8, right:8, display:'flex', gap:4, zIndex:1 }}>
                    {t.popular && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:'rgba(255,255,255,0.95)', color:'#f59e0b' }}>⭐ Popular</span>}
                    {t.new    && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:'rgba(99,102,241,0.9)', color:'#fff' }}>✨ New</span>}
                  </div>
                </div>
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)', marginBottom:4 }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginBottom:8, lineHeight:1.4 }}>{t.description.slice(0,70)}…</div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                    {Object.entries(t.defaultFeatures).filter(([,v])=>v).slice(0,4).map(([k]) => (
                      <span key={k} style={{ fontSize:10, padding:'1px 6px', borderRadius:5, background:'rgba(99,102,241,0.08)', color:'#818cf8' }}>{k}</span>
                    ))}
                    {Object.values(t.defaultFeatures).filter(Boolean).length > 4 && (
                      <span style={{ fontSize:10, padding:'1px 6px', borderRadius:5, background:'var(--color-background-tertiary)', color:'var(--color-text-tertiary)' }}>+{Object.values(t.defaultFeatures).filter(Boolean).length-4} more</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GENERATE FORM
  // ─────────────────────────────────────────────────────────────────────────
  function renderGenerateForm() {
    if (generating || step === 4) {
      const steps = ['Designing layout','Writing copy','Building sections','Styling & polish','Finalizing'];
      return (
        <div style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', minHeight:480, padding:48 }}>
          {/* Animated ring */}
          <div style={{ position:'relative', width:80, height:80, marginBottom:32 }}>
            <svg viewBox="0 0 80 80" style={{ width:80, height:80, position:'absolute', top:0, left:0, animation:'wb-spin 1.4s linear infinite' }}>
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="6"/>
              <circle cx="40" cy="40" r="34" fill="none" stroke="#6366f1" strokeWidth="6"
                strokeDasharray="60 154" strokeLinecap="round" strokeDashoffset="0"/>
            </svg>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🌐</div>
          </div>

          <div style={{ fontSize:20, fontWeight:800, color:'var(--color-text-primary)', marginBottom:6 }}>Building your website…</div>
          <div style={{ fontSize:13, color:'var(--color-text-tertiary)', marginBottom:32 }}>This usually takes 20–45 seconds</div>

          {/* Step progress pills */}
          <div style={{ display:'flex', flexDirection:'column' as const, gap:10, width:'100%', maxWidth:340 }}>
            {steps.map((s, i) => (
              <div key={s} style={{ display:'flex', alignItems:'center', gap:10, animation:`wb-fadein 0.4s ease ${i * 0.5}s both` }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:'rgba(99,102,241,0.12)', border:'1.5px solid rgba(99,102,241,0.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:'#6366f1', animation:`wb-pulse 1.2s ease ${i * 0.5}s infinite` }}/>
                </div>
                <div style={{ flex:1, height:4, borderRadius:4, background:'rgba(99,102,241,0.08)', overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:4, background:'linear-gradient(90deg,#6366f1,#8b5cf6)', animation:`wb-fill 2s ease ${i * 0.6}s both` }}/>
                </div>
                <span style={{ fontSize:11, color:'var(--color-text-tertiary)', whiteSpace:'nowrap' as const, width:110, textAlign:'right' as const }}>{s}</span>
              </div>
            ))}
          </div>

          <style>{`
            @keyframes wb-spin { to { transform: rotate(360deg); } }
            @keyframes wb-pulse { 0%,100%{opacity:0.4;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }
            @keyframes wb-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
            @keyframes wb-fill { from{width:0} to{width:100%} }
          `}</style>
        </div>
      );
    }

    const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
      width: '100%',
      padding: '10px 14px',
      borderRadius: 10,
      border: '1px solid var(--color-border-secondary)',
      background: 'var(--color-background-primary)',
      color: 'var(--color-text-primary)',
      fontFamily: 'inherit',
      fontSize: 13,
      lineHeight: '1.5',
      boxSizing: 'border-box' as const,
      outline: 'none',
      transition: 'border-color 0.15s, box-shadow 0.15s',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      ...extra,
    });
    const lbl: React.CSSProperties = { display:'block', fontSize:11, fontWeight:700, color:'var(--color-text-secondary)', marginBottom:6, textTransform:'uppercase' as const, letterSpacing:'0.6px' };

    return (
      <div style={{ maxWidth:740, margin:'0 auto' }}>
        {/* Step indicator */}
        <div style={{ display:'flex', gap:0, marginBottom:28 }}>
          {['Choose Template','Business Info','Choose Features','Generate'].map((s,i) => (
            <div key={s} style={{ flex:1, display:'flex', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }} onClick={()=>i+1<=step&&setStep(i+1)}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:step>i+1?'#6366f1':step===i+1?'#6366f1':'var(--color-background-tertiary)', color:step>=i+1?'#fff':'var(--color-text-tertiary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                  {step>i+1?'✓':i+1}
                </div>
                <span style={{ fontSize:12, fontWeight:step===i+1?700:400, color:step===i+1?'#818cf8':'var(--color-text-tertiary)', whiteSpace:'nowrap' as const }}>{s}</span>
              </div>
              {i<3&&<div style={{ flex:1, height:1, background:'var(--color-border-tertiary)', margin:'0 8px' }}/>}
            </div>
          ))}
        </div>

        {error && <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.3)', color:'#ef4444', fontSize:13, marginBottom:16 }}>{error}</div>}

        {step === 1 && (
          <div style={{ borderRadius:12, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-primary)', padding:24 }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Choose a Template (Optional)</div>
            <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginBottom:16 }}>Templates pre-fill industry, colors, and features. You can customize everything after.</div>
            <Button onClick={()=>setStep(2)} className="w-full">Skip — Start from Scratch →</Button>
            <div style={{ textAlign:'center' as const, margin:'14px 0', fontSize:12, color:'var(--color-text-tertiary)' }}>or</div>
            <Button variant="secondary" onClick={()=>{setMode('library');setStep(1)}} className="w-full">Browse {templates.length}+ Templates →</Button>
          </div>
        )}

        {step === 2 && (
          <div style={{ borderRadius:12, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-primary)', padding:24 }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:16 }}>Tell the AI about your website</div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Business / Organization Name *</label>
              <input value={build.businessName} onChange={e=>setBuild(b=>({...b,businessName:e.target.value}))} placeholder="e.g. Grace Community Church, Sunrise Café, TechForward Inc." style={inp()} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Industry</label>
                <input value={build.industry} onChange={e=>setBuild(b=>({...b,industry:e.target.value}))} placeholder="e.g. Church, Restaurant, Nonprofit" style={inp()} />
              </div>
              <div>
                <label style={lbl}>Location (optional)</label>
                <input value={build.location} onChange={e=>setBuild(b=>({...b,location:e.target.value}))} placeholder="e.g. Austin, Texas" style={inp()} />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Describe Your Website *</label>
              <textarea value={build.description} onChange={e=>setBuild(b=>({...b,description:e.target.value}))} rows={4} placeholder="e.g. A Pentecostal church serving 800 members with Sunday services, youth programs, and community outreach." style={inp({resize:'vertical' as const})} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Color Scheme</label>
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6, marginBottom:8 }}>
                {COLOR_PRESETS.map(c => (
                  <button key={c.value} onClick={()=>setBuild(b=>({...b,colorScheme:c.value}))} style={{ padding:'5px 12px', borderRadius:7, border:`1.5px solid ${build.colorScheme===c.value?'#6366f1':'var(--color-border-secondary)'}`, background:build.colorScheme===c.value?'rgba(99,102,241,0.1)':'var(--color-background-secondary)', color:build.colorScheme===c.value?'#818cf8':'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer', fontWeight:build.colorScheme===c.value?700:400 }}>{c.label}</button>
                ))}
              </div>
              <input value={build.colorScheme} onChange={e=>setBuild(b=>({...b,colorScheme:e.target.value}))} placeholder="Custom colors (e.g. #2D5A27 and warm white)" style={inp({fontSize:12})} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={lbl}>Font Style</label>
              <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6, marginBottom:8 }}>
                {FONT_PRESETS.map(f => (
                  <button key={f.value} onClick={()=>setBuild(b=>({...b,fontStyle:f.value}))} style={{ padding:'5px 12px', borderRadius:7, border:`1.5px solid ${build.fontStyle===f.value?'#6366f1':'var(--color-border-secondary)'}`, background:build.fontStyle===f.value?'rgba(99,102,241,0.1)':'var(--color-background-secondary)', color:build.fontStyle===f.value?'#818cf8':'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer', fontWeight:build.fontStyle===f.value?700:400 }}>{f.label}</button>
                ))}
              </div>
              <input value={build.fontStyle} onChange={e=>setBuild(b=>({...b,fontStyle:e.target.value}))} placeholder="Custom font preferences (e.g. Modern sans-serif, Elegant Serif, etc.)" style={inp({fontSize:12})} />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Generation Quality</label>
              <div style={{ display:'flex', gap:10 }}>
                {([['standard','⚡ Standard (Fast & Reliable)'],['premium','🏆 Premium (Most creative & high quality)']] as const).map(([q,label]) => (
                  <div key={q} onClick={()=>setBuild(b=>({...b,quality:q}))} style={{ flex:1, padding:'10px 14px', borderRadius:9, border:`1.5px solid ${build.quality===q?'#6366f1':'var(--color-border-secondary)'}`, background:build.quality===q?'rgba(99,102,241,0.08)':'var(--color-background-secondary)', cursor:'pointer' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:build.quality===q?'#818cf8':'var(--color-text-primary)' }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <Button variant="secondary" onClick={()=>setStep(1)}>← Back</Button>
              <Button onClick={()=>setStep(3)} disabled={!build.businessName.trim()||!build.description.trim()} className="flex-1">Choose Features →</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ borderRadius:12, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-primary)', padding:24 }}>
            <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Which sections do you need?</div>
            <div style={{ fontSize:13, color:'var(--color-text-secondary)', marginBottom:16 }}>Select all that apply.</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8, marginBottom:20 }}>
              {FEATURE_OPTIONS.map(f => {
                const on = !!build.features[f.key];
                return (
                  <div key={f.key} onClick={()=>setBuild(b=>({...b,features:{...b.features,[f.key]:!on}}))} style={{ padding:'10px 12px', borderRadius:9, border:`1.5px solid ${on?'#6366f1':'var(--color-border-secondary)'}`, background:on?'rgba(99,102,241,0.07)':'var(--color-background-secondary)', cursor:'pointer', transition:'all 0.12s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <span style={{ fontSize:16 }}>{f.icon}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:on?'#818cf8':'var(--color-text-primary)' }}>{f.label}</span>
                      {on && <span style={{ marginLeft:'auto', fontSize:14, color:'#6366f1' }}>✓</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--color-text-tertiary)', paddingLeft:22 }}>{f.desc}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={lbl}>Additional Instructions (optional)</label>
              <textarea value={build.additionalContext} onChange={e=>setBuild(b=>({...b,additionalContext:e.target.value}))} rows={2} placeholder="e.g. Include a prayer request form, show Sunday service times as 8am, 10am, 12pm..." style={inp({resize:'vertical' as const})} />
            </div>
            <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginBottom:14 }}>
              {Object.values(build.features).filter(Boolean).length} sections selected · Est. cost: ~$0.03–0.06
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <Button variant="secondary" onClick={()=>setStep(2)}>← Back</Button>
              <Button onClick={proposeAndGenerate} disabled={generating} className="flex-1">🚀 {generating ? 'Creating proposal...' : 'Generate My Website →'}</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PREVIEW VIEW
  // ─────────────────────────────────────────────────────────────────────────
  function renderPreview() {
    const html = normalizeHtml(generatedHtml || activeWebsite?.html || '');
    const siteTitle = activeWebsite?.title || activeWebsite?.businessName || 'Preview';
    const isPublished = activeWebsite?.status === 'published';

    return (
      <div style={{ display:'flex', flexDirection:'column' as const, height:'calc(100vh - 60px)' }}>

        {/* ── Toolbar ── */}
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 14px', height:50, borderBottom:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-primary)', flexShrink:0 }}>
          {/* Left: title + status */}
          <div style={{ display:'flex', alignItems:'center', gap:8, flex:'0 1 auto', minWidth:0, overflow:'hidden' }}>
            <button onClick={() => setMode('library')} style={{ padding:'4px 10px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-tertiary)', fontFamily:'inherit', fontSize:11, cursor:'pointer', flexShrink:0, lineHeight:1.4 }}>← Back</button>
            <span style={{ fontSize:13, fontWeight:700, color:'var(--color-text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const, maxWidth:260 }}>{siteTitle}</span>
            {isPublished && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:'rgba(34,197,94,0.12)', color:'#22c55e', border:'0.5px solid rgba(34,197,94,0.3)', flexShrink:0 }}>● Live</span>}
          </div>

          {/* Center: device toggle */}
          <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
            <div style={{ display:'inline-flex', borderRadius:8, border:'0.5px solid var(--color-border-secondary)', overflow:'hidden' }}>
              {([['desktop','🖥️','Desktop'],['tablet','⬛','Tablet'],['mobile','📱','Mobile']] as const).map(([d,icon,label]) => (
                <button key={d} onClick={() => setPreviewMode(d)} title={label} style={{ padding:'6px 14px', border:'none', background:previewMode===d?'rgba(99,102,241,0.15)':'transparent', color:previewMode===d?'#818cf8':'var(--color-text-tertiary)', fontFamily:'inherit', fontSize:13, cursor:'pointer', fontWeight:previewMode===d?600:400, transition:'all 0.15s' }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {publishUrl && (
              <a href={publishUrl} target="_blank" rel="noopener noreferrer" title={publishUrl} style={{ fontSize:11, color:'#22c55e', fontWeight:600, textDecoration:'none', display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:7, background:'rgba(34,197,94,0.08)', border:'0.5px solid rgba(34,197,94,0.25)' }}>
                🌐 Live
              </a>
            )}
            <button onClick={openEditor} style={{ padding:'5px 12px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>✏️ Edit</button>
            <button onClick={() => { setStep(3); setMode('generate'); }} style={{ padding:'5px 12px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>🔄 Regen</button>
            <button onClick={downloadHtml} title="Download HTML" style={{ padding:'5px 10px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:12, cursor:'pointer' }}>⬇️</button>
            <Button size="sm" onClick={publishSite} disabled={publishing}>{publishing?'Publishing…':'🚀 Publish'}</Button>
          </div>
        </div>

        {/* ── Preview area ── */}
        <div style={{ flex:1, overflow:'hidden', background:'#c8cbd0', display:'flex', justifyContent:'center', alignItems:'stretch', padding:previewMode==='desktop'?0:'20px' }}>
          <div style={{ width:PREVIEW_W[previewMode], transition:'width 0.3s', display:'flex', flexDirection:'column' as const, ...(previewMode!=='desktop' ? { borderRadius:16, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.35)', maxHeight:'100%' } : {}) }}>
            {/* Mock browser chrome for non-desktop modes */}
            {previewMode !== 'desktop' && (
              <div style={{ height:32, background:'#1a1b2e', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0 }}>
                <div style={{ display:'flex', gap:6, position:'absolute', left:12 }}>
                  {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width:10, height:10, borderRadius:'50%', background:c }}/>)}
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', fontFamily:'inherit' }}>{previewMode}</div>
              </div>
            )}
            <iframe ref={iframeRef} srcDoc={html} title="Website Preview" style={{ flex:1, width:'100%', minHeight:400, border:'none', background:'#fff' }} sandbox="allow-scripts allow-top-navigation-by-user-activation allow-popups" />
          </div>
        </div>

        {publishUrl && (
          <div style={{ padding:'8px 16px', background:'rgba(34,197,94,0.06)', borderTop:'0.5px solid rgba(34,197,94,0.2)', fontSize:12, color:'#22c55e', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            ✅ Published!
            <a href={publishUrl} target="_blank" rel="noopener noreferrer" style={{ color:'#16a34a', fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{publishUrl}</a>
          </div>
        )}
        {renderFloatingChat()}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MY WEBSITES VIEW (with CMS sub-tabs)
  // ─────────────────────────────────────────────────────────────────────────
  function renderMyWebsites() {
    const subTabStyle = (active: boolean): React.CSSProperties => ({
      padding:'6px 16px', borderRadius:7, border:'none', fontFamily:'inherit', fontSize:12,
      fontWeight: active ? 700 : 400, cursor:'pointer', transition:'all 0.15s',
      background: active ? 'var(--color-background-primary)' : 'transparent',
      color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
      whiteSpace: 'nowrap' as const,
    });

    return (
      <div>
        {/* Sub-tabs */}
        <div style={{ display:'flex', gap:2, marginBottom:20, background:'var(--color-background-secondary)', borderRadius:10, padding:4, width:'fit-content' }}>
          <button style={subTabStyle(myWebsiteTab==='sites')} onClick={()=>setMyWebsiteTab('sites')}>🌐 Sites {myWebsites.length > 0 && `(${myWebsites.length})`}</button>
          <button style={subTabStyle(myWebsiteTab==='cms')} onClick={()=>{ setMyWebsiteTab('cms'); if(myWebsites.length>0 && !cmsSelectedSite) loadCmsCollections(myWebsites[0]); }}>🗄️ CMS Content</button>
          <button style={subTabStyle(myWebsiteTab==='domains')} onClick={()=>setMyWebsiteTab('domains')}>🔗 Domains</button>
        </div>

        {/* ── Sites tab ── */}
        {myWebsiteTab === 'sites' && (
          myWebsites.length === 0 ? (
            <div style={{ textAlign:'center' as const, padding:'48px 24px', color:'var(--color-text-tertiary)' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🌐</div>
              <div style={{ fontWeight:700, marginBottom:4 }}>No websites yet</div>
              <div style={{ fontSize:13 }}>Generate your first AI website in seconds.</div>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
              {myWebsites.map(site => (
                <div key={site.id} style={{ borderRadius:12, border:'0.5px solid var(--color-border-secondary)', overflow:'hidden', background:'var(--color-background-primary)' }}>
                  <div style={{ height:100, position:'relative', overflow:'hidden' }}>
                    <TemplateMockup gradient={getTemplateColor(site.industry)} accent={site.id} />
                    <div style={{ position:'absolute', top:8, right:8, zIndex:1 }}>
                      <Badge variant="outline" style={{ background:site.status==='published'?'rgba(34,197,94,0.2)':'rgba(245,158,11,0.2)', color:site.status==='published'?'#16a34a':'#d97706', border:'none', fontSize:10 }}>{site.status}</Badge>
                    </div>
                  </div>
                  <div style={{ padding:16 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'var(--color-text-primary)', marginBottom:3 }}>{site.businessName}</div>
                    <div style={{ fontSize:12, color:'var(--color-text-tertiary)', marginBottom:10 }}>{site.industry}</div>
                    {site.publishedUrl && <a href={site.publishedUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'#22c55e', display:'block', marginBottom:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>🌐 {site.publishedUrl}</a>}
                    <div style={{ display:'flex', gap:6 }}>
                      <Button size="sm" variant="secondary" onClick={()=>{setActiveWebsite(site);setGeneratedHtml(site.html);setMode('preview')}} className="flex-1">Preview</Button>
                      <Button size="sm" variant="secondary" onClick={()=>{setActiveWebsite(site);setGeneratedHtml(site.html);openEditor();}} className="flex-1">✏️ Edit</Button>
                      <Button size="sm" variant="secondary" onClick={()=>{ setMyWebsiteTab('cms'); loadCmsCollections(site); }} className="flex-1">🗄️ CMS</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── CMS tab ── */}
        {myWebsiteTab === 'cms' && (
          <div>
            {/* Site selector */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
              <select
                value={cmsSelectedSite?.id || ''}
                onChange={e => { const s = myWebsites.find(w => w.id === e.target.value); if (s) loadCmsCollections(s); }}
                style={{ padding:'8px 12px', borderRadius:8, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:13, minWidth:220 }}
              >
                {myWebsites.length === 0 && <option value="">No websites</option>}
                {myWebsites.map(w => <option key={w.id} value={w.id}>{w.businessName}</option>)}
              </select>
              {cmsSelectedSite && (
                <Button size="sm" variant="secondary" onClick={syncCmsContent} disabled={cmsSyncing}>
                  {cmsSyncing ? '⟳ Syncing…' : '⚡ Sync to Site'}
                </Button>
              )}
              <div style={{ flex:1 }} />
              {cmsSelectedSite && (
                <Button size="sm" onClick={() => setCmsColModal(true)} style={{ background:'rgba(99,102,241,0.1)', color:'#818cf8', border:'0.5px solid rgba(99,102,241,0.3)' }}>
                  + New Collection
                </Button>
              )}
            </div>

            {!cmsSelectedSite || myWebsites.length === 0 ? (
              <div style={{ textAlign:'center' as const, padding:'48px 24px', color:'var(--color-text-tertiary)' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🗄️</div>
                <div style={{ fontWeight:700, marginBottom:4 }}>No website selected</div>
                <div style={{ fontSize:13 }}>Generate a website first, then manage its CMS content here.</div>
              </div>
            ) : cmsLoadingCols ? (
              <div style={{ textAlign:'center' as const, padding:48, color:'var(--color-text-tertiary)' }}>Loading collections…</div>
            ) : cmsCollections.length === 0 ? (
              <div style={{ textAlign:'center' as const, padding:'48px 24px', color:'var(--color-text-tertiary)' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
                <div style={{ fontWeight:700, marginBottom:4 }}>No content collections yet</div>
                <div style={{ fontSize:13, marginBottom:16 }}>Create a collection to start managing dynamic content sections.</div>
                <Button onClick={() => setCmsColModal(true)}>+ Create First Collection</Button>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
                {cmsCollections.map(col => (
                  <div key={col.id} style={{ borderRadius:12, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-primary)', padding:16, cursor:'pointer', transition:'border-color 0.15s' }}
                    onClick={() => openCmsRecords(col)}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700, color:'var(--color-text-primary)', marginBottom:2 }}>{col.name}</div>
                        <div style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>#{col.sectionId} · {col.fields.length} fields</div>
                      </div>
                      <button onClick={e=>{ e.stopPropagation(); deleteCmsCollection(col.id); }} style={{ padding:'3px 6px', background:'none', border:'none', cursor:'pointer', color:'#ef4444', fontSize:13, borderRadius:5 }}>✕</button>
                    </div>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const }}>
                      {col.fields.slice(0,4).map(f => (
                        <span key={f.name} style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:'rgba(99,102,241,0.08)', color:'#818cf8' }}>{f.label}</span>
                      ))}
                      {col.fields.length > 4 && <span style={{ fontSize:10, padding:'2px 7px', borderRadius:5, background:'var(--color-background-tertiary)', color:'var(--color-text-tertiary)' }}>+{col.fields.length-4}</span>}
                    </div>
                    <div style={{ marginTop:10, fontSize:11, color:'#6366f1' }}>Click to manage records →</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── New Collection Modal ── */}
            {cmsColModal && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
                <div style={{ background:'var(--color-background-primary)', borderRadius:16, padding:24, width:'100%', maxWidth:540, maxHeight:'85vh', overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, marginBottom:16, color:'var(--color-text-primary)' }}>New Content Collection</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    <div>
                      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--color-text-secondary)', marginBottom:4, textTransform:'uppercase' as const }}>Name</label>
                      <input value={newColName} onChange={e=>setNewColName(e.target.value)} placeholder="e.g. Our Team" style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:13, boxSizing:'border-box' as const }} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--color-text-secondary)', marginBottom:4, textTransform:'uppercase' as const }}>Section ID</label>
                      <input value={newColSec} onChange={e=>setNewColSec(e.target.value)} placeholder="e.g. team" style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:13, boxSizing:'border-box' as const }} />
                    </div>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--color-text-secondary)', textTransform:'uppercase' as const }}>Fields</div>
                      <button onClick={() => setNewColFields(prev => [...prev, { name:'', label:'', type:'text', required:false }])} style={{ padding:'3px 9px', borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>+ Add Field</button>
                    </div>
                    {newColFields.map((f, i) => (
                      <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                        <input placeholder="Label" value={f.label} onChange={e=>{ const fs=[...newColFields]; fs[i]={...fs[i],label:e.target.value,name:e.target.value.toLowerCase().replace(/\s+/g,'_')}; setNewColFields(fs); }} style={{ flex:1, padding:'7px 9px', borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:12 }} />
                        <select value={f.type} onChange={e=>{ const fs=[...newColFields]; fs[i]={...fs[i],type:e.target.value as any}; setNewColFields(fs); }} style={{ padding:'7px 9px', borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:12 }}>
                          <option value="text">Short Text</option>
                          <option value="textarea">Long Text</option>
                          <option value="image">Image URL</option>
                          <option value="number">Number</option>
                          <option value="url">URL</option>
                        </select>
                        {i > 0 && <button onClick={() => setNewColFields(prev => prev.filter((_,idx)=>idx!==i))} style={{ padding:'3px 6px', background:'none', border:'none', cursor:'pointer', color:'#ef4444', fontSize:14 }}>✕</button>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <Button variant="secondary" onClick={() => setCmsColModal(false)} className="flex-1">Cancel</Button>
                    <Button onClick={createCmsCollection} disabled={newColSaving || !newColName || !newColSec} className="flex-1">{newColSaving ? 'Creating…' : 'Create Collection'}</Button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Records Modal ── */}
            {cmsRecordModal && cmsActiveCol && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
                <div style={{ background:'var(--color-background-primary)', borderRadius:16, padding:24, width:'100%', maxWidth:720, maxHeight:'85vh', display:'flex', flexDirection:'column' as const }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexShrink:0 }}>
                    <div>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--color-text-primary)' }}>{cmsActiveCol.name}</div>
                      <div style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>#{cmsActiveCol.sectionId}</div>
                    </div>
                    <button onClick={() => setCmsRecordModal(false)} style={{ padding:'4px 8px', background:'none', border:'0.5px solid var(--color-border-secondary)', borderRadius:7, cursor:'pointer', color:'var(--color-text-secondary)', fontSize:13 }}>✕ Close</button>
                  </div>

                  {/* Add record form */}
                  <div style={{ marginBottom:16, padding:14, borderRadius:10, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-secondary)', flexShrink:0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--color-text-tertiary)', textTransform:'uppercase' as const, letterSpacing:'0.6px', marginBottom:10 }}>Add New Entry</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:8, marginBottom:10 }}>
                      {cmsActiveCol.fields.map(f => (
                        <div key={f.name}>
                          <label style={{ display:'block', fontSize:10, fontWeight:700, color:'var(--color-text-tertiary)', marginBottom:3, textTransform:'uppercase' as const }}>{f.label}</label>
                          {f.type === 'textarea' ? (
                            <textarea value={newRecData[f.name]||''} onChange={e=>setNewRecData(d=>({...d,[f.name]:e.target.value}))} rows={2} style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-primary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:11, resize:'none' as const, boxSizing:'border-box' as const }} />
                          ) : (
                            <input type={f.type==='number'?'number':'text'} value={newRecData[f.name]||''} onChange={e=>setNewRecData(d=>({...d,[f.name]:e.target.value}))} style={{ width:'100%', padding:'6px 8px', borderRadius:6, border:'0.5px solid var(--color-border-secondary)', background:'var(--color-background-primary)', color:'var(--color-text-primary)', fontFamily:'inherit', fontSize:11, boxSizing:'border-box' as const }} />
                          )}
                        </div>
                      ))}
                    </div>
                    <Button size="sm" onClick={createCmsRecord} disabled={newRecSaving}>{newRecSaving ? 'Saving…' : '+ Save Entry'}</Button>
                  </div>

                  {/* Records table */}
                  <div style={{ flex:1, overflowY:'auto' }}>
                    {cmsLoadingRecs ? (
                      <div style={{ textAlign:'center' as const, padding:32, color:'var(--color-text-tertiary)' }}>Loading records…</div>
                    ) : cmsRecords.length === 0 ? (
                      <div style={{ textAlign:'center' as const, padding:32, color:'var(--color-text-tertiary)' }}>
                        <div style={{ fontSize:24, marginBottom:6 }}>📋</div>
                        <div>No records yet. Add your first entry above.</div>
                      </div>
                    ) : (
                      <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:12 }}>
                        <thead>
                          <tr style={{ borderBottom:'0.5px solid var(--color-border-tertiary)', background:'var(--color-background-secondary)' }}>
                            {cmsActiveCol.fields.slice(0,4).map(f => (
                              <th key={f.name} style={{ padding:'8px 12px', fontWeight:700, fontSize:10, textTransform:'uppercase' as const, letterSpacing:'0.5px', color:'var(--color-text-tertiary)', textAlign:'left' as const }}>{f.label}</th>
                            ))}
                            <th style={{ width:50 }} />
                          </tr>
                        </thead>
                        <tbody>
                          {cmsRecords.map(rec => (
                            <tr key={rec.id} style={{ borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
                              {cmsActiveCol.fields.slice(0,4).map(f => (
                                <td key={f.name} style={{ padding:'9px 12px', color:'var(--color-text-primary)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                                  {f.type==='image' && rec.data[f.name]
                                    ? <img src={rec.data[f.name]} style={{ width:28, height:28, borderRadius:5, objectFit:'cover' as const }} alt="" />
                                    : String(rec.data[f.name] ?? '–')}
                                </td>
                              ))}
                              <td style={{ padding:'9px 12px' }}>
                                <button onClick={()=>deleteCmsRecord(rec.id)} style={{ padding:'3px 6px', background:'none', border:'none', cursor:'pointer', color:'#ef4444', fontSize:13 }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Domains tab ── */}
        {myWebsiteTab === 'domains' && (
          <div style={{ textAlign:'center' as const, padding:'48px 24px' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🔗</div>
            <div style={{ fontSize:16, fontWeight:700, color:'var(--color-text-primary)', marginBottom:6 }}>Domain Management</div>
            <div style={{ fontSize:13, color:'var(--color-text-tertiary)', marginBottom:20 }}>Connect custom domains, manage DNS, and link sites to domains.</div>
            <Button onClick={() => window.location.href = '/domains'}>Go to Domain Manager →</Button>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Root render
  // ─────────────────────────────────────────────────────────────────────────

  // Show full-page loading while initial data loads
  if (loading && templates.length === 0) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--color-background-primary)' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16, animation:'spin 1.5s linear infinite' }}>🌐</div>
          <div style={{ fontSize:18, fontWeight:600, color:'var(--color-text-primary)', marginBottom:8 }}>Loading Website Builder</div>
          <div style={{ fontSize:14, color:'var(--color-text-tertiary)' }}>Getting templates and your websites ready...</div>
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (mode === 'editor') {
    return <AppLayout>{renderEditor()}</AppLayout>;
  }

  const content = (
    <div style={{ padding: mode==='preview' ? 0 : '24px 28px', maxWidth: mode==='preview' ? '100%' : 1200 }}>
      {mode !== 'preview' && (
        <>
          {/* ── Page header ── */}
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20, paddingBottom:20, borderBottom:'0.5px solid var(--color-border-tertiary)' }}>
            <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🌐</div>
            <div style={{ flex:1 }}>
              <h1 style={{ fontSize:20, fontWeight:800, color:'var(--color-text-primary)', margin:'0 0 2px' }}>AI Website Builder</h1>
              <div style={{ fontSize:12, color:'var(--color-text-tertiary)' }}>Generate production-ready websites from a description · {templates.length}+ industry templates</div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button onClick={() => setMode('mywebsites')} style={{ padding:'7px 14px', borderRadius:8, border:'0.5px solid var(--color-border-secondary)', background:'none', color:'var(--color-text-secondary)', fontFamily:'inherit', fontSize:13, cursor:'pointer' }}>My Websites {myWebsites.length > 0 && `(${myWebsites.length})`}</button>
              <Button size="sm" onClick={() => { setMode('generate'); setStep(2); setBuild({ ...DEFAULT_BUILD }); }}>+ New Website</Button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display:'flex', gap:2, marginBottom:24, background:'var(--color-background-secondary)', borderRadius:10, padding:4, width:'fit-content' }}>
            {([
              ['library',   '🏛️', 'Templates'],
              ['generate',  '✨', 'AI Generator'],
              ['mywebsites','🌐', `My Sites${myWebsites.length ? ` (${myWebsites.length})` : ''}`],
              ['forms',     '🛠️', 'Form Builder'],
              ['myforms',   '📋', `My Forms${savedForms.length ? ` (${savedForms.length})` : ''}`],
            ] as const).map(([m, icon, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{ padding:'7px 16px', borderRadius:7, border:'none', background:mode===m?'var(--color-background-primary)':'transparent', color:mode===m?'var(--color-text-primary)':'var(--color-text-tertiary)', fontFamily:'inherit', fontSize:13, fontWeight:mode===m?700:400, cursor:'pointer', transition:'all 0.15s', boxShadow:mode===m?'0 1px 4px rgba(0,0,0,0.08)':'none', whiteSpace:'nowrap' as const }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {error && <div style={{ padding:'12px 16px', borderRadius:8, background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.3)', color:'#ef4444', fontSize:13, marginBottom:16 }}>{error}</div>}
          {loading && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:48, color:'var(--color-text-tertiary)' }}>
              <div style={{ fontSize:24, animation:'spin 1.2s linear infinite', marginRight:12 }}>⟳</div>
              <span style={{ fontSize:14 }}>Loading…</span>
              <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
        </>
      )}
      {!loading && (
        <>
          {mode === 'library'    && renderLibrary()}
          {mode === 'generate'   && renderGenerateForm()}
          {mode === 'mywebsites' && renderMyWebsites()}
          {mode === 'preview'    && renderPreview()}
          {mode === 'forms'      && renderFormCreator()}
          {mode === 'myforms'    && renderMyForms()}
        </>
      )}
    </div>
  );

  // ────────────────────────────────────────────────────────────────────
  // Proposal Modal
  // ────────────────────────────────────────────────────────────────────

  if (proposalOpen && proposalData) {
    const currentBalance = walletBalance?.balance ?? 0;

    // Clean up markdown formatting from proposal text
    const cleanProposal = proposalData.proposal
      .replace(/^###\s+/gm, '')
      .replace(/^##\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/^---$/gm, '');

    return (
      <AppLayout>
        <div style={{ maxWidth: 900, margin: '40px auto', padding: '20px' }}>
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 16, border: '0.5px solid var(--color-border-secondary)', padding: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Website Proposal</h2>

            {/* Full Proposal Text - No Height Limit */}
            <div style={{ background: 'var(--color-background-secondary)', padding: 20, borderRadius: 12, marginBottom: 28, fontSize: 14, color: 'var(--color-text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {cleanProposal}
            </div>

            {/* Chat Interface for Refinement */}
            <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 12, marginBottom: 24, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>💬 Refine this proposal</div>

              {proposalChatMsgs.length > 0 && (
                <div style={{ background: 'var(--color-background-primary)', borderRadius: 8, padding: 12, marginBottom: 12, maxHeight: 200, overflowY: 'auto', fontSize: 13 }}>
                  {proposalChatMsgs.map((msg, i) => (
                    <div key={i} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: i < proposalChatMsgs.length - 1 ? '0.5px solid var(--color-border-secondary)' : 'none' }}>
                      <strong style={{ color: msg.role === 'user' ? '#6366f1' : '#10b981' }}>{msg.role === 'user' ? '👤 You' : '🤖 AI'}:</strong>
                      <div style={{ marginTop: 4, color: 'var(--color-text-secondary)' }}>{msg.text.substring(0, 150)}{msg.text.length > 150 ? '...' : ''}</div>
                    </div>
                  ))}
                  <div ref={proposalChatEndRef} />
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  value={proposalChatInput}
                  onChange={e => setProposalChatInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && refineProposal()}
                  placeholder="Ask for changes (e.g., 'make it more colorful')"
                  disabled={proposalChatLoading}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 8, border: '0.5px solid var(--color-border-secondary)',
                    background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontSize: 13
                  }}
                />
                <Button onClick={refineProposal} disabled={proposalChatLoading || !proposalChatInput.trim()} style={{ padding: '10px 18px', fontSize: 13 }}>
                  {proposalChatLoading ? '...' : 'Refine'}
                </Button>
              </div>
            </div>

            {/* Cost Section */}
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '0.5px solid rgba(99, 102, 241, 0.3)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>COST</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#6366f1' }}>{proposalData.credits} credit{proposalData.credits !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                Your balance: {currentBalance} credit{currentBalance !== 1 ? 's' : ''}
              </div>
            </div>

            {currentBalance < proposalData.credits && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '0.5px solid rgba(239, 68, 68, 0.3)', borderRadius: 12, padding: 12, marginBottom: 20, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                ⚠️ You need {proposalData.credits - currentBalance} more credit{proposalData.credits - currentBalance !== 1 ? 's' : ''}. Add credits to proceed.
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="outline" onClick={() => setProposalOpen(false)} style={{ flex: 1 }}>
                Back
              </Button>
              {currentBalance < proposalData.credits ? (
                <Button onClick={() => navigate('/settings/billing')} style={{ flex: 1 }}>
                  + Add Credits
                </Button>
              ) : (
                <Button onClick={confirmAndGenerate} style={{ flex: 1 }}>
                  Confirm & Generate
                </Button>
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Add Credits Dialog (from Proposal) - DISABLED
  // ────────────────────────────────────────────────────────────────────
  // Commented out - users navigate directly to /settings/billing
  /*
  if (showAddCreditsDialog) {
    const cost = addCreditsAmount * 1;
    return (
      <AppLayout>
        <div style={{ maxWidth: 500, margin: '60px auto', padding: '20px' }}>
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 16, border: '0.5px solid var(--color-border-secondary)', padding: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Add Credits</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              How many credits would you like to add? ($1 per credit)
            </p>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-tertiary)', display: 'block', marginBottom: 8 }}>Number of Credits</label>
              <input
                type="number"
                min="1"
                value={addCreditsAmount}
                onChange={e => setAddCreditsAmount(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, border: '0.5px solid var(--color-border-secondary)',
                  background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontSize: 14
                }}
              />
            </div>

            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '0.5px solid rgba(99, 102, 241, 0.3)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>TOTAL COST</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#6366f1' }}>${cost}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {addCreditsAmount} credits × $1 = ${cost}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="outline" onClick={() => setShowAddCreditsDialog(false)} style={{ flex: 1 }}>
                Cancel
              </Button>
              <Button onClick={handleAddCredits} style={{ flex: 1 }}>
                Proceed to Billing →
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  */

  // ────────────────────────────────────────────────────────────────────
  // Add Credits Modal
  // ────────────────────────────────────────────────────────────────────

  if (needsCreditsModal && creditsModalData) {
    return (
      <AppLayout>
        <div style={{ maxWidth: 500, margin: '60px auto', padding: '20px' }}>
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 16, border: '0.5px solid var(--color-border-secondary)', padding: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 16 }}>💳</div>

            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Add Website Builder Credits</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              You need <strong>{creditsModalData.required} credits</strong> to generate this website, but you only have <strong>{creditsModalData.available} credits</strong>.
            </p>

            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '0.5px solid rgba(99, 102, 241, 0.3)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                💡 Add credits through your billing section. You can purchase credits in bulk at $0.10 per credit.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="outline" onClick={() => { setNeedsCreditsModal(false); setStep(3); }} style={{ flex: 1 }}>
                Cancel
              </Button>
              <Button onClick={() => window.location.href = '/settings?tab=billing'} style={{ flex: 1 }}>
                Go to Billing →
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return <AppLayout>{content}</AppLayout>;
}

export default withPlanGate("website.builder")(AIWebsiteBuilder);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getTemplateColor(seed: string): string {
  const palettes = [
    '#6366f1, #8b5cf6','#0ea5e9, #0284c7','#10b981, #059669',
    '#f59e0b, #d97706','#ef4444, #dc2626','#8b5cf6, #7c3aed',
    '#14b8a6, #0d9488','#f97316, #ea580c','#ec4899, #db2777',
    '#22c55e, #16a34a','#3b82f6, #2563eb','#a855f7, #9333ea',
  ];
  let hash = 0;
  for (const c of seed) hash = (hash << 5) - hash + c.charCodeAt(0);
  return palettes[Math.abs(hash) % palettes.length];
}

function getCategoryIcon(cat: string): string {
  const map: Record<string,string> = {
    'Nonprofit & Charity':'❤️','Religious & Faith':'⛪','Business & Corporate':'🏢',
    'Healthcare & Wellness':'🏥','Education & E-Learning':'📚','Restaurant & Food':'🍽️',
    'Retail & E-Commerce':'🛍️','Real Estate':'🏠','Legal & Professional':'⚖️',
    'Creative & Portfolio':'🎨','Technology & SaaS':'💻','Events & Entertainment':'🎭',
    'Travel & Hospitality':'✈️','Fitness & Sports':'💪','Finance & Fintech':'💰',
    'Beauty & Lifestyle':'💄','Construction & Trades':'🏗️','Automotive':'🚗',
    'Government & Community':'🏛️','Agriculture & Environment':'🌱',
  };
  return map[cat] || map[Object.keys(map).find(k => cat.includes(k.split(' ')[0])) ?? ''] || '🌐';
}

function TemplateMockup({ gradient, accent }: { gradient: string; accent: string }) {
  return (
    <svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%', display:'block' }}>
      <defs>
        <linearGradient id={`g-${accent}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={gradient.split(',')[0].trim()} />
          <stop offset="100%" stopColor={(gradient.split(',')[1] || gradient.split(',')[0]).trim()} />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="240" height="140" fill={`url(#g-${accent})`} />
      {/* Nav bar */}
      <rect x="0" y="0" width="240" height="18" fill="rgba(0,0,0,0.25)" />
      <rect x="10" y="6" width="28" height="6" rx="3" fill="rgba(255,255,255,0.9)" />
      <rect x="160" y="6" width="16" height="6" rx="3" fill="rgba(255,255,255,0.5)" />
      <rect x="182" y="6" width="16" height="6" rx="3" fill="rgba(255,255,255,0.5)" />
      <rect x="204" y="6" width="16" height="6" rx="3" fill="rgba(255,255,255,0.5)" />
      {/* Hero section */}
      <rect x="30" y="32" width="100" height="10" rx="4" fill="rgba(255,255,255,0.95)" />
      <rect x="30" y="47" width="140" height="5" rx="3" fill="rgba(255,255,255,0.55)" />
      <rect x="30" y="57" width="120" height="5" rx="3" fill="rgba(255,255,255,0.45)" />
      <rect x="30" y="70" width="56" height="14" rx="7" fill="rgba(255,255,255,0.95)" />
      <rect x="94" y="70" width="40" height="14" rx="7" fill="rgba(255,255,255,0.25)" />
      {/* Cards row */}
      <rect x="10" y="98" width="66" height="34" rx="5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      <rect x="87" y="98" width="66" height="34" rx="5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      <rect x="164" y="98" width="66" height="34" rx="5" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
      {/* Card content lines */}
      {[10,87,164].map((x,i) => (
        <g key={i}>
          <rect x={x+6} y="106" width="30" height="4" rx="2" fill="rgba(255,255,255,0.7)" />
          <rect x={x+6} y="114" width="48" height="3" rx="2" fill="rgba(255,255,255,0.4)" />
          <rect x={x+6} y="121" width="36" height="3" rx="2" fill="rgba(255,255,255,0.3)" />
        </g>
      ))}
      {/* Hero image placeholder */}
      <rect x="170" y="26" width="60" height="60" rx="8" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
      <circle cx="200" cy="48" r="12" fill="rgba(255,255,255,0.2)" />
      <rect x="185" y="65" width="30" height="4" rx="2" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}
