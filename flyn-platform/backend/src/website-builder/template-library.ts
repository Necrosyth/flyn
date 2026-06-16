// ─── FLYN AI Website Builder — Template Library ──────────────────────────────
// 200+ templates organised by industry and purpose
// Each template is a seed that AI expands into a complete, world-class website
// ─────────────────────────────────────────────────────────────────────────────

export interface WebsiteTemplate {
  id:          string;
  name:        string;
  category:    string;       // industry group
  industry:    string;
  purpose:     string;
  description: string;
  defaultFeatures: Record<string, boolean>;
  colorHint:   string;
  fontHint:    string;
  pages:       string[];     // available page types for this template
  tags:        string[];
  popular?:    boolean;
  new?:        boolean;
}

export const TEMPLATE_CATEGORIES = [
  'Nonprofit & Charity',
  'Religious & Faith',
  'Business & Corporate',
  'Healthcare & Wellness',
  'Education & E-Learning',
  'Restaurant & Food',
  'Retail & E-Commerce',
  'Real Estate',
  'Legal & Professional',
  'Creative & Portfolio',
  'Technology & SaaS',
  'Events & Entertainment',
  'Travel & Hospitality',
  'Fitness & Sports',
  'Finance & Fintech',
  'Beauty & Lifestyle',
  'Construction & Trades',
  'Automotive',
  'Government & Community',
  'Agriculture & Environment',
];

export const PAGE_TYPES = [
  'Homepage', 'About Us', 'Services', 'Products', 'Contact',
  'Pricing', 'Team', 'Blog', 'Portfolio', 'FAQ',
  'Testimonials', 'Events', 'Gallery', 'Volunteer', 'Donate',
  'Register', 'Login', 'Thank You', 'Coming Soon', '404 Error',
  'Privacy Policy', 'Terms of Service', 'Careers', 'Case Studies',
  'Landing Page', 'Membership', 'Booking', 'Shop', 'Checkout',
];

function t(overrides: Partial<WebsiteTemplate> & Pick<WebsiteTemplate, 'id'|'name'|'industry'|'purpose'|'description'>): WebsiteTemplate {
  return {
    category:       'Business & Corporate',
    colorHint:      'professional and modern',
    fontHint:       'clean sans-serif',
    pages:          ['Homepage', 'About Us', 'Services', 'Contact', 'FAQ'],
    defaultFeatures: { contact: true, testimonials: true, stats: true, newsletter: true },
    tags:           [],
    ...overrides,
  };
}

export const TEMPLATES: WebsiteTemplate[] = [

  // ── NONPROFIT & CHARITY ──────────────────────────────────────────────────
  t({ id:'npo-001', name:'Community Food Bank', industry:'Food Bank / Hunger Relief', purpose:'nonprofit', category:'Nonprofit & Charity',
    description:'A food bank serving local families in need with donation drives, volunteer programs, and community outreach.',
    defaultFeatures:{ donations:true, volunteers:true, events:true, stats:true, newsletter:true, contact:true, testimonials:true },
    colorHint:'warm orange and earthy greens', fontHint:'friendly and approachable', popular:true,
    pages:['Homepage','About Us','Donate','Volunteer','Events','Blog','Contact','FAQ'],
    tags:['food','hunger','community','donation','volunteer'] }),

  t({ id:'npo-002', name:'Animal Rescue Shelter', industry:'Animal Welfare / Rescue', purpose:'nonprofit', category:'Nonprofit & Charity',
    description:'An animal rescue shelter finding loving homes for dogs, cats, and other pets while providing veterinary care.',
    defaultFeatures:{ donations:true, volunteers:true, gallery:true, registration:true, stats:true, contact:true },
    colorHint:'warm purples and golden yellows', fontHint:'friendly rounded sans-serif',
    pages:['Homepage','Adopt','Volunteer','Donate','Our Animals','Events','Contact'],
    tags:['animals','rescue','adoption','pets','donate'] }),

  t({ id:'npo-003', name:'Youth Mentorship Program', industry:'Youth Development', purpose:'nonprofit', category:'Nonprofit & Charity',
    description:'Connecting at-risk youth with professional mentors to build skills, confidence, and career pathways.',
    defaultFeatures:{ registration:true, volunteers:true, donations:true, events:true, blog:true, contact:true },
    colorHint:'vibrant blue and energetic orange', fontHint:'bold and inspiring',
    pages:['Homepage','Programs','Mentors','Volunteer','Donate','Success Stories','Contact'],
    tags:['youth','mentorship','education','community','volunteer'] }),

  t({ id:'npo-004', name:'Environmental Conservation', industry:'Environmental / Green', purpose:'nonprofit', category:'Nonprofit & Charity',
    description:'Protecting local ecosystems, clean water, and forests through advocacy, volunteer cleanups, and education.',
    defaultFeatures:{ volunteers:true, donations:true, events:true, blog:true, gallery:true, newsletter:true },
    colorHint:'forest greens and deep teals', fontHint:'clean eco-inspired',
    pages:['Homepage','Our Mission','Get Involved','Donate','Blog','Gallery','Contact'],
    tags:['environment','conservation','green','sustainability','volunteer'] }),

  t({ id:'npo-005', name:'Homeless Shelter & Services', industry:'Social Services', purpose:'nonprofit', category:'Nonprofit & Charity',
    description:'Providing emergency shelter, meals, job training, and support services to individuals experiencing homelessness.',
    defaultFeatures:{ donations:true, volunteers:true, registration:true, events:true, stats:true, contact:true },
    colorHint:'deep navy and warm cream', fontHint:'dignified and welcoming',
    pages:['Homepage','Services','Volunteer','Donate','Stories','Contact'],
    tags:['homeless','shelter','social services','community','donation'] }),

  t({ id:'npo-006', name:'Women Empowerment Foundation', industry:'Women\'s Rights / Empowerment', purpose:'nonprofit', category:'Nonprofit & Charity',
    description:'Supporting women through education, entrepreneurship training, legal aid, and community building programs.',
    defaultFeatures:{ donations:true, registration:true, events:true, blog:true, team:true, contact:true },
    colorHint:'bold fuchsia and gold', fontHint:'powerful and elegant',
    pages:['Homepage','Programs','Events','Stories','Donate','About','Contact'],
    tags:['women','empowerment','equality','education','community'] }),

  t({ id:'npo-007', name:'Children\'s Cancer Foundation', industry:'Medical Charity', purpose:'nonprofit', category:'Nonprofit & Charity',
    description:'Funding pediatric cancer research and supporting families with financial assistance and emotional support.',
    defaultFeatures:{ donations:true, events:true, blog:true, stats:true, gallery:true, contact:true }, popular:true,
    colorHint:'hopeful sky blue and sunshine yellow', fontHint:'warm and compassionate',
    pages:['Homepage','Our Mission','Research','Support Families','Donate','Events','Contact'],
    tags:['children','cancer','medical','charity','research','donation'] }),

  // ── RELIGIOUS & FAITH ───────────────────────────────────────────────────
  t({ id:'rel-001', name:'Christian Church', industry:'Christian / Protestant Church', purpose:'church', category:'Religious & Faith',
    description:'A welcoming Christian community with Sunday services, small groups, youth programs, and community outreach.',
    defaultFeatures:{ events:true, registration:true, donations:true, gallery:true, blog:true, contact:true, newsletter:true }, popular:true,
    colorHint:'regal navy and gold with warm white', fontHint:'classic serif with modern sans',
    pages:['Homepage','About','Sermons','Events','Groups','Ministries','Give','Contact'],
    tags:['church','christian','worship','community','faith','sunday service'] }),

  t({ id:'rel-002', name:'Catholic Parish', industry:'Catholic Church', purpose:'church', category:'Religious & Faith',
    description:'A Catholic parish community offering Masses, sacraments, religious education, and social justice ministry.',
    defaultFeatures:{ events:true, registration:true, donations:true, blog:true, contact:true },
    colorHint:'deep burgundy and gold', fontHint:'traditional yet accessible serif',
    pages:['Homepage','Mass Times','Sacraments','Ministries','Education','Events','Give','Contact'],
    tags:['catholic','parish','mass','sacraments','faith'] }),

  t({ id:'rel-003', name:'Islamic Center & Mosque', industry:'Islamic Center / Mosque', purpose:'mosque', category:'Religious & Faith',
    description:'A vibrant Islamic center providing prayer services, Quran classes, youth programs, and interfaith dialogue.',
    defaultFeatures:{ events:true, registration:true, donations:true, gallery:true, contact:true },
    colorHint:'deep green and white with gold accents', fontHint:'elegant and dignified',
    pages:['Homepage','Prayer Times','Programs','Events','Donate','Contact'],
    tags:['mosque','islam','muslim','community','prayer','quran'] }),

  t({ id:'rel-004', name:'Synagogue & Jewish Center', industry:'Jewish Community Center', purpose:'synagogue', category:'Religious & Faith',
    description:'A welcoming synagogue and Jewish cultural center with services, holiday programs, and educational classes.',
    defaultFeatures:{ events:true, registration:true, donations:true, members:true, contact:true },
    colorHint:'deep blue and silver', fontHint:'refined and welcoming',
    pages:['Homepage','Services','Education','Events','Membership','Donate','Contact'],
    tags:['synagogue','jewish','torah','community','shabbat'] }),

  t({ id:'rel-005', name:'Buddhist Temple', industry:'Buddhist Center', purpose:'temple', category:'Religious & Faith',
    description:'A peaceful Buddhist temple offering meditation classes, dharma teachings, and mindfulness retreats.',
    defaultFeatures:{ events:true, registration:true, donations:true, gallery:true, contact:true },
    colorHint:'saffron orange and deep maroon', fontHint:'serene and minimal',
    pages:['Homepage','Classes','Events','Retreats','Donate','About','Contact'],
    tags:['buddhist','temple','meditation','mindfulness','dharma'] }),

  t({ id:'rel-006', name:'Pentecostal Church', industry:'Pentecostal / Charismatic Church', purpose:'church', category:'Religious & Faith',
    description:'A spirit-filled Pentecostal church with energetic worship, healing services, cell groups, and missions work.',
    defaultFeatures:{ events:true, registration:true, donations:true, gallery:true, blog:true, contact:true },
    colorHint:'vibrant red-orange and deep purple', fontHint:'bold and dynamic',
    pages:['Homepage','Services','Ministries','Events','Missions','Give','Contact'],
    tags:['pentecostal','church','worship','spirit','missions','prayer'] }),

  t({ id:'rel-007', name:'Interdenominational Ministry', industry:'Non-Denominational Church', purpose:'ministry', category:'Religious & Faith',
    description:'A non-denominational ministry reaching all backgrounds with online services, podcasts, and life groups.',
    defaultFeatures:{ events:true, registration:true, donations:true, blog:true, newsletter:true, contact:true }, new:true,
    colorHint:'modern charcoal and electric blue', fontHint:'contemporary clean sans',
    pages:['Homepage','Services','Watch Online','Life Groups','Podcast','Give','Contact'],
    tags:['ministry','church','non-denominational','online','community'] }),

  // ── HEALTHCARE & WELLNESS ───────────────────────────────────────────────
  t({ id:'hlth-001', name:'Medical Practice / Clinic', industry:'Medical Practice', purpose:'healthcare', category:'Healthcare & Wellness',
    description:'A general medical practice offering primary care, preventive services, and specialist referrals.',
    defaultFeatures:{ booking:true, team:true, faq:true, testimonials:true, contact:true }, popular:true,
    colorHint:'calming blue and clinical white', fontHint:'trustworthy professional sans',
    pages:['Homepage','Services','Our Doctors','Book Appointment','Patient Portal','FAQ','Contact'],
    tags:['medical','clinic','doctors','healthcare','appointment'] }),

  t({ id:'hlth-002', name:'Dental Practice', industry:'Dental / Dentistry', purpose:'healthcare', category:'Healthcare & Wellness',
    description:'A modern dental practice offering general, cosmetic, and orthodontic dentistry for the whole family.',
    defaultFeatures:{ booking:true, pricing:true, gallery:true, testimonials:true, faq:true, contact:true },
    colorHint:'fresh mint green and crisp white', fontHint:'clean approachable sans',
    pages:['Homepage','Services','Smile Gallery','Book Appointment','Financing','FAQ','Contact'],
    tags:['dental','dentist','teeth','cosmetic','orthodontics'] }),

  t({ id:'hlth-003', name:'Mental Health Practice', industry:'Mental Health / Therapy', purpose:'therapy', category:'Healthcare & Wellness',
    description:'A compassionate mental health practice offering individual therapy, couples counseling, and group sessions.',
    defaultFeatures:{ booking:true, team:true, faq:true, blog:true, contact:true },
    colorHint:'soft sage green and warm lavender', fontHint:'gentle calming serif',
    pages:['Homepage','Therapy Services','Our Therapists','Resources','Book Session','FAQ','Contact'],
    tags:['mental health','therapy','counseling','psychology','wellbeing'] }),

  t({ id:'hlth-004', name:'Chiropractic Center', industry:'Chiropractic', purpose:'healthcare', category:'Healthcare & Wellness',
    description:'A chiropractic center specializing in spine health, sports injuries, and holistic wellness treatments.',
    defaultFeatures:{ booking:true, testimonials:true, faq:true, pricing:true, contact:true },
    colorHint:'energetic green and confident navy', fontHint:'strong clean sans',
    pages:['Homepage','Conditions','Treatments','Book Appointment','Testimonials','FAQ','Contact'],
    tags:['chiropractic','spine','wellness','pain relief','holistic'] }),

  t({ id:'hlth-005', name:'Yoga & Wellness Studio', industry:'Yoga / Wellness Studio', purpose:'fitness', category:'Healthcare & Wellness',
    description:'A holistic yoga studio offering classes for all levels, meditation, workshops, and wellness retreats.',
    defaultFeatures:{ booking:true, pricing:true, events:true, gallery:true, newsletter:true, contact:true }, popular:true,
    colorHint:'warm terracotta and sage green', fontHint:'flowing elegant serif',
    pages:['Homepage','Classes','Schedule','Workshops','Pricing','Gallery','Blog','Contact'],
    tags:['yoga','wellness','meditation','studio','fitness','classes'] }),

  t({ id:'hlth-006', name:'Physical Therapy Clinic', industry:'Physical Therapy', purpose:'healthcare', category:'Healthcare & Wellness',
    description:'A sports and orthopedic physical therapy clinic helping patients recover faster and perform better.',
    defaultFeatures:{ booking:true, team:true, blog:true, testimonials:true, contact:true },
    colorHint:'athletic blue and vibrant orange', fontHint:'dynamic professional sans',
    pages:['Homepage','Conditions','Treatments','Our Team','Blog','Book Appointment','Contact'],
    tags:['physical therapy','rehab','sports','orthopedic','recovery'] }),

  // ── EDUCATION & E-LEARNING ──────────────────────────────────────────────
  t({ id:'edu-001', name:'Private School', industry:'K-12 Education', purpose:'school', category:'Education & E-Learning',
    description:'A private K-12 school offering rigorous academics, arts, athletics, and character development.',
    defaultFeatures:{ registration:true, events:true, blog:true, gallery:true, team:true, contact:true }, popular:true,
    colorHint:'distinguished navy and gold', fontHint:'academic serif with clean sans',
    pages:['Homepage','Academics','Admissions','Athletics','Arts','News','Calendar','Contact'],
    tags:['school','education','k-12','private','admissions','academics'] }),

  t({ id:'edu-002', name:'Online Learning Platform', industry:'E-Learning / EdTech', purpose:'education', category:'Education & E-Learning',
    description:'An online education platform with video courses, certificates, live classes, and career coaching.',
    defaultFeatures:{ pricing:true, registration:true, testimonials:true, blog:true, faq:true, leadCapture:true }, popular:true, new:true,
    colorHint:'electric purple and bright yellow', fontHint:'modern geometric sans',
    pages:['Homepage','Courses','Pricing','Instructors','Blog','Login','Register','Contact'],
    tags:['online learning','courses','edtech','certificates','e-learning'] }),

  t({ id:'edu-003', name:'Tutoring Center', industry:'Tutoring / Academic Support', purpose:'education', category:'Education & E-Learning',
    description:'An in-person and online tutoring center for K-12 and college students in all subjects.',
    defaultFeatures:{ booking:true, pricing:true, registration:true, testimonials:true, faq:true, contact:true },
    colorHint:'energetic green and deep blue', fontHint:'friendly approachable sans',
    pages:['Homepage','Subjects','Our Tutors','Pricing','Book Session','Testimonials','Contact'],
    tags:['tutoring','academic','students','homework help','test prep'] }),

  t({ id:'edu-004', name:'University & College', industry:'Higher Education', purpose:'university', category:'Education & E-Learning',
    description:'A university offering undergraduate and graduate programs in arts, science, business, and technology.',
    defaultFeatures:{ events:true, registration:true, blog:true, gallery:true, stats:true, contact:true },
    colorHint:'classic maroon and gold', fontHint:'prestigious serif headline with clean body',
    pages:['Homepage','Programs','Admissions','Research','Campus Life','Alumni','Contact'],
    tags:['university','college','higher education','admissions','campus'] }),

  t({ id:'edu-005', name:'Music School', industry:'Music Education', purpose:'music school', category:'Education & E-Learning',
    description:'A music school teaching piano, guitar, voice, violin, drums, and music theory for all ages.',
    defaultFeatures:{ booking:true, pricing:true, events:true, gallery:true, registration:true, contact:true },
    colorHint:'rich black and gold with burgundy accents', fontHint:'elegant with musical character',
    pages:['Homepage','Instruments','Instructors','Schedule','Events','Pricing','Book Trial','Contact'],
    tags:['music','lessons','piano','guitar','school','children'] }),

  t({ id:'edu-006', name:'Dance Academy', industry:'Dance Education', purpose:'dance school', category:'Education & E-Learning',
    description:'A professional dance academy teaching ballet, hip-hop, contemporary, and ballroom for all levels.',
    defaultFeatures:{ registration:true, events:true, gallery:true, pricing:true, contact:true },
    colorHint:'dramatic black and rose gold', fontHint:'graceful elegant serif',
    pages:['Homepage','Classes','Schedule','Shows & Events','Gallery','Enroll','Contact'],
    tags:['dance','ballet','hip-hop','academy','classes','performance'] }),

  // ── RESTAURANT & FOOD ────────────────────────────────────────────────────
  t({ id:'rst-001', name:'Restaurant / Fine Dining', industry:'Restaurant', purpose:'restaurant', category:'Restaurant & Food',
    description:'An upscale restaurant serving contemporary cuisine with an emphasis on local, seasonal ingredients.',
    defaultFeatures:{ booking:true, gallery:true, events:true, newsletter:true, contact:true }, popular:true,
    colorHint:'rich burgundy and warm cream with gold', fontHint:'elegant serif headline',
    pages:['Homepage','Menu','Reservations','Private Dining','Gallery','Gift Cards','Contact'],
    tags:['restaurant','dining','food','reservation','menu','cuisine'] }),

  t({ id:'rst-002', name:'Café & Coffee Shop', industry:'Café / Coffee Shop', purpose:'cafe', category:'Restaurant & Food',
    description:'A cozy neighborhood café serving artisan coffee, fresh pastries, light meals, and local events.',
    defaultFeatures:{ gallery:true, events:true, newsletter:true, contact:true, ecommerce:true },
    colorHint:'warm coffee brown and cream', fontHint:'artsy hand-lettering inspired',
    pages:['Homepage','Menu','Shop','Events','About','Contact'],
    tags:['cafe','coffee','pastries','artisan','cozy','neighborhood'] }),

  t({ id:'rst-003', name:'Fast Food / Quick Service', industry:'Fast Food / QSR', purpose:'restaurant', category:'Restaurant & Food',
    description:'A quick-service restaurant known for fresh, made-to-order burgers, fries, and shakes.',
    defaultFeatures:{ ecommerce:true, gallery:true, leadCapture:true, contact:true },
    colorHint:'bold red and sunny yellow', fontHint:'bold punchy sans',
    pages:['Homepage','Menu','Order Online','Franchise','Careers','Contact'],
    tags:['fast food','burger','quick service','order online','menu'] }),

  t({ id:'rst-004', name:'Bakery & Patisserie', industry:'Bakery', purpose:'bakery', category:'Restaurant & Food',
    description:'An artisan bakery specializing in sourdough bread, French pastries, custom cakes, and wedding cakes.',
    defaultFeatures:{ gallery:true, booking:true, ecommerce:true, newsletter:true, contact:true },
    colorHint:'soft blush pink and warm cream', fontHint:'delicate script with clean sans',
    pages:['Homepage','Products','Custom Orders','Gallery','Order Online','About','Contact'],
    tags:['bakery','pastry','bread','cakes','artisan','wedding'] }),

  t({ id:'rst-005', name:'Food Truck', industry:'Food Truck / Mobile', purpose:'food truck', category:'Restaurant & Food',
    description:'A popular food truck bringing bold Mexican street food flavors to festivals, events, and daily stops.',
    defaultFeatures:{ events:true, newsletter:true, leadCapture:true, contact:true },
    colorHint:'vibrant teal and sunny orange', fontHint:'bold street art inspired',
    pages:['Homepage','Menu','Find Us','Catering','Events','Contact'],
    tags:['food truck','street food','mobile','catering','events'] }),

  // ── RETAIL & E-COMMERCE ──────────────────────────────────────────────────
  t({ id:'ret-001', name:'Fashion Boutique', industry:'Fashion / Apparel', purpose:'retail', category:'Retail & E-Commerce',
    description:'A curated fashion boutique offering contemporary women\'s clothing, accessories, and styling services.',
    defaultFeatures:{ ecommerce:true, newsletter:true, blog:true, leadCapture:true, contact:true }, popular:true,
    colorHint:'sophisticated black and warm rose gold', fontHint:'chic editorial serif',
    pages:['Homepage','Shop','Collections','Style Blog','About','Contact'],
    tags:['fashion','boutique','clothing','style','women','accessories'] }),

  t({ id:'ret-002', name:'Home Decor & Furnishings', industry:'Home Decor / Interior Design', purpose:'retail', category:'Retail & E-Commerce',
    description:'A home decor store offering furniture, lighting, and unique décor items to elevate any living space.',
    defaultFeatures:{ ecommerce:true, gallery:true, blog:true, newsletter:true, contact:true },
    colorHint:'warm earth tones and soft neutrals', fontHint:'elegant refined sans',
    pages:['Homepage','Shop','Room Inspiration','Blog','About','Contact'],
    tags:['home decor','furniture','interior design','lifestyle','shop'] }),

  t({ id:'ret-003', name:'Electronics & Tech Store', industry:'Electronics / Technology Retail', purpose:'retail', category:'Retail & E-Commerce',
    description:'A consumer electronics retailer selling the latest smartphones, laptops, audio, and smart home devices.',
    defaultFeatures:{ ecommerce:true, pricing:true, faq:true, testimonials:true, contact:true },
    colorHint:'sleek dark gray and electric blue', fontHint:'tech-forward geometric sans',
    pages:['Homepage','Products','Deals','Trade-In','Support','Contact'],
    tags:['electronics','tech','gadgets','smartphones','laptops','shop'] }),

  t({ id:'ret-004', name:'Health & Beauty Store', industry:'Beauty / Health Products', purpose:'retail', category:'Retail & E-Commerce',
    description:'A clean beauty and wellness store specializing in natural skincare, supplements, and organic products.',
    defaultFeatures:{ ecommerce:true, blog:true, newsletter:true, leadCapture:true, contact:true },
    colorHint:'fresh green and soft blush', fontHint:'clean natural sans',
    pages:['Homepage','Shop','Ingredients','Blog','About','Contact'],
    tags:['beauty','skincare','natural','organic','wellness','shop'] }),

  t({ id:'ret-005', name:'Pet Store & Supplies', industry:'Pet Products / Services', purpose:'retail', category:'Retail & E-Commerce',
    description:'A pet store offering premium food, supplies, grooming, and veterinary referral services for all pets.',
    defaultFeatures:{ ecommerce:true, booking:true, gallery:true, newsletter:true, contact:true },
    colorHint:'playful teal and sunny yellow', fontHint:'friendly rounded sans',
    pages:['Homepage','Shop','Grooming','Vet Services','Adoption','Blog','Contact'],
    tags:['pets','store','grooming','supplies','dogs','cats'] }),

  // ── REAL ESTATE ─────────────────────────────────────────────────────────
  t({ id:'re-001', name:'Real Estate Agency', industry:'Real Estate', purpose:'real estate', category:'Real Estate',
    description:'A full-service real estate agency helping buyers, sellers, and investors navigate the local property market.',
    defaultFeatures:{ leadCapture:true, team:true, testimonials:true, blog:true, contact:true }, popular:true,
    colorHint:'confident navy and gold', fontHint:'professional authoritative serif',
    pages:['Homepage','Buy','Sell','Rent','Our Team','Listings','Blog','Contact'],
    tags:['real estate','property','homes','buy','sell','agent'] }),

  t({ id:'re-002', name:'Property Management', industry:'Property Management', purpose:'property management', category:'Real Estate',
    description:'A property management company handling tenant relations, maintenance, and financial reporting for landlords.',
    defaultFeatures:{ leadCapture:true, pricing:true, faq:true, team:true, contact:true },
    colorHint:'slate blue and clean white', fontHint:'corporate reliable sans',
    pages:['Homepage','Services','Pricing','Tenant Portal','Owner Portal','FAQ','Contact'],
    tags:['property management','rental','landlord','tenant','real estate'] }),

  t({ id:'re-003', name:'Luxury Real Estate', industry:'Luxury Real Estate', purpose:'luxury real estate', category:'Real Estate',
    description:'An exclusive luxury real estate firm representing high-end residential and commercial properties.',
    defaultFeatures:{ gallery:true, leadCapture:true, team:true, testimonials:true, contact:true },
    colorHint:'champagne gold and deep charcoal', fontHint:'ultra-refined luxury serif',
    pages:['Homepage','Properties','About Us','Concierge Services','Contact'],
    tags:['luxury','real estate','high-end','estate','premium'] }),

  // ── LEGAL & PROFESSIONAL ────────────────────────────────────────────────
  t({ id:'leg-001', name:'Law Firm', industry:'Legal / Law Firm', purpose:'law firm', category:'Legal & Professional',
    description:'A full-service law firm specializing in personal injury, family law, business law, and criminal defense.',
    defaultFeatures:{ leadCapture:true, team:true, testimonials:true, faq:true, contact:true }, popular:true,
    colorHint:'authoritative navy and gold', fontHint:'trustworthy classic serif',
    pages:['Homepage','Practice Areas','Our Attorneys','Case Results','Blog','Contact'],
    tags:['law','legal','attorney','lawyer','firm'] }),

  t({ id:'leg-002', name:'Accounting Firm', industry:'Accounting / CPA', purpose:'accounting', category:'Legal & Professional',
    description:'A certified public accounting firm providing tax planning, audit, bookkeeping, and business advisory services.',
    defaultFeatures:{ leadCapture:true, team:true, pricing:true, faq:true, contact:true },
    colorHint:'trustworthy teal and deep charcoal', fontHint:'reliable professional sans',
    pages:['Homepage','Services','Our Team','Pricing','Resources','Contact'],
    tags:['accounting','CPA','tax','bookkeeping','business'] }),

  t({ id:'leg-003', name:'Marketing Agency', industry:'Marketing / Creative Agency', purpose:'agency', category:'Legal & Professional',
    description:'A full-service digital marketing agency offering SEO, PPC, social media, content, and web design.',
    defaultFeatures:{ portfolio:true, testimonials:true, pricing:true, blog:true, leadCapture:true, contact:true }, popular:true,
    colorHint:'bold gradient purple and electric cyan', fontHint:'edgy modern sans',
    pages:['Homepage','Services','Work','Pricing','Blog','Case Studies','Contact'],
    tags:['marketing','agency','digital','SEO','social media','branding'] }),

  t({ id:'leg-004', name:'HR & Staffing Agency', industry:'HR / Recruitment', purpose:'staffing', category:'Legal & Professional',
    description:'A staffing agency connecting businesses with qualified candidates for temp, contract, and permanent roles.',
    defaultFeatures:{ leadCapture:true, registration:true, team:true, blog:true, contact:true },
    colorHint:'professional blue and fresh green', fontHint:'approachable corporate sans',
    pages:['Homepage','Find Talent','Find Jobs','Industries','About','Blog','Contact'],
    tags:['staffing','recruitment','HR','jobs','talent','hiring'] }),

  t({ id:'leg-005', name:'Insurance Agency', industry:'Insurance', purpose:'insurance', category:'Legal & Professional',
    description:'An independent insurance agency offering auto, home, life, and business insurance with personalized service.',
    defaultFeatures:{ leadCapture:true, team:true, faq:true, testimonials:true, contact:true },
    colorHint:'trustworthy blue and safety green', fontHint:'reliable clean sans',
    pages:['Homepage','Products','Get a Quote','Claims','Blog','About','Contact'],
    tags:['insurance','auto','home','life','business','coverage'] }),

  // ── TECHNOLOGY & SAAS ───────────────────────────────────────────────────
  t({ id:'tech-001', name:'SaaS Product Landing Page', industry:'SaaS / Software', purpose:'saas', category:'Technology & SaaS',
    description:'A B2B SaaS platform for project management, team collaboration, and workflow automation.',
    defaultFeatures:{ pricing:true, leadCapture:true, testimonials:true, faq:true, blog:true, stats:true }, popular:true, new:true,
    colorHint:'modern indigo and electric cyan', fontHint:'sharp geometric sans',
    pages:['Homepage','Features','Pricing','Integrations','Blog','Login','Sign Up'],
    tags:['saas','software','app','startup','tech','B2B'] }),

  t({ id:'tech-002', name:'Tech Startup', industry:'Technology Startup', purpose:'startup', category:'Technology & SaaS',
    description:'An AI-powered analytics startup helping enterprises make data-driven decisions faster.',
    defaultFeatures:{ leadCapture:true, pricing:true, team:true, blog:true, stats:true, newsletter:true },
    colorHint:'dark mode with neon green accents', fontHint:'futuristic clean sans',
    pages:['Homepage','Product','Pricing','About','Blog','Careers','Contact'],
    tags:['startup','AI','technology','analytics','venture','B2B'] }),

  t({ id:'tech-003', name:'Web Development Agency', industry:'Web Development / Design', purpose:'agency', category:'Technology & SaaS',
    description:'A web development and design agency building custom websites, web apps, and e-commerce solutions.',
    defaultFeatures:{ portfolio:true, pricing:true, testimonials:true, leadCapture:true, contact:true },
    colorHint:'creative gradient dark with bright accent', fontHint:'developer-edgy mono-inspired',
    pages:['Homepage','Services','Portfolio','Process','Pricing','Contact'],
    tags:['web development','design','agency','websites','apps'] }),

  t({ id:'tech-004', name:'Cybersecurity Firm', industry:'Cybersecurity', purpose:'security', category:'Technology & SaaS',
    description:'An enterprise cybersecurity firm providing threat detection, penetration testing, and security training.',
    defaultFeatures:{ leadCapture:true, blog:true, team:true, stats:true, contact:true },
    colorHint:'dark slate with neon red and electric blue', fontHint:'technical monospace-inspired',
    pages:['Homepage','Solutions','Services','Resources','About','Contact'],
    tags:['cybersecurity','security','enterprise','hacking','protection'] }),

  // ── FITNESS & SPORTS ────────────────────────────────────────────────────
  t({ id:'fit-001', name:'Gym & Fitness Center', industry:'Gym / Fitness Center', purpose:'fitness', category:'Fitness & Sports',
    description:'A modern gym offering weight training, cardio, group classes, personal training, and nutrition coaching.',
    defaultFeatures:{ pricing:true, registration:true, booking:true, gallery:true, testimonials:true, contact:true }, popular:true,
    colorHint:'bold black and electric yellow', fontHint:'strong athletic sans',
    pages:['Homepage','Classes','Membership','Personal Training','Schedule','Gallery','Contact'],
    tags:['gym','fitness','workout','membership','personal training','classes'] }),

  t({ id:'fit-002', name:'Sports Club', industry:'Sports Club / Team', purpose:'sports', category:'Fitness & Sports',
    description:'A recreational sports club with adult leagues for soccer, basketball, tennis, and volleyball.',
    defaultFeatures:{ registration:true, events:true, members:true, gallery:true, contact:true },
    colorHint:'team red and white with dark navy', fontHint:'sporty bold sans',
    pages:['Homepage','Sports','Leagues','Register','Events','Gallery','Contact'],
    tags:['sports','club','leagues','recreation','soccer','basketball'] }),

  t({ id:'fit-003', name:'Personal Trainer', industry:'Personal Training', purpose:'personal trainer', category:'Fitness & Sports',
    description:'A certified personal trainer offering 1-on-1 coaching, online programs, and nutrition plans.',
    defaultFeatures:{ leadCapture:true, pricing:true, testimonials:true, booking:true, contact:true },
    colorHint:'energetic orange and charcoal black', fontHint:'bold motivational sans',
    pages:['Homepage','Programs','Pricing','Testimonials','Book Free Consult','Blog','Contact'],
    tags:['personal trainer','fitness','coaching','nutrition','transformation'] }),

  // ── EVENTS & ENTERTAINMENT ──────────────────────────────────────────────
  t({ id:'evt-001', name:'Event Planning Company', industry:'Event Planning', purpose:'events', category:'Events & Entertainment',
    description:'A full-service event planning company specializing in corporate events, galas, weddings, and conferences.',
    defaultFeatures:{ portfolio:true, leadCapture:true, testimonials:true, gallery:true, contact:true }, popular:true,
    colorHint:'elegant gold and deep charcoal', fontHint:'luxurious script with clean sans',
    pages:['Homepage','Services','Portfolio','Testimonials','Blog','Get Quote','Contact'],
    tags:['events','wedding','corporate','gala','planning','conference'] }),

  t({ id:'evt-002', name:'Concert Venue / Music Hall', industry:'Entertainment Venue', purpose:'venue', category:'Events & Entertainment',
    description:'A premier live music venue hosting concerts, festivals, private events, and emerging artist nights.',
    defaultFeatures:{ events:true, registration:true, gallery:true, newsletter:true, contact:true },
    colorHint:'moody black and neon purple', fontHint:'rock-inspired edgy sans',
    pages:['Homepage','Events','Artists','Venue Rental','Gallery','Contact'],
    tags:['venue','concerts','music','events','entertainment','live'] }),

  t({ id:'evt-003', name:'Wedding Planning', industry:'Wedding / Bridal', purpose:'wedding', category:'Events & Entertainment',
    description:'A boutique wedding planning and coordination service creating unforgettable ceremonies and receptions.',
    defaultFeatures:{ gallery:true, leadCapture:true, testimonials:true, portfolio:true, contact:true },
    colorHint:'romantic blush and rose gold', fontHint:'dreamy script with elegant serif',
    pages:['Homepage','Services','Gallery','Real Weddings','About','Pricing','Contact'],
    tags:['wedding','bridal','planning','ceremony','reception','love'] }),

  // ── TRAVEL & HOSPITALITY ────────────────────────────────────────────────
  t({ id:'trv-001', name:'Hotel & Resort', industry:'Hotel / Hospitality', purpose:'hotel', category:'Travel & Hospitality',
    description:'A luxury boutique hotel and resort offering exceptional accommodation, dining, and spa experiences.',
    defaultFeatures:{ booking:true, gallery:true, events:true, testimonials:true, newsletter:true, contact:true }, popular:true,
    colorHint:'coastal navy and warm sand', fontHint:'refined luxury serif',
    pages:['Homepage','Rooms & Suites','Dining','Spa','Events','Gallery','Book Now','Contact'],
    tags:['hotel','resort','luxury','accommodation','travel','spa'] }),

  t({ id:'trv-002', name:'Travel Agency', industry:'Travel Agency', purpose:'travel', category:'Travel & Hospitality',
    description:'A full-service travel agency specializing in custom vacation packages, luxury trips, and group travel.',
    defaultFeatures:{ leadCapture:true, blog:true, gallery:true, newsletter:true, contact:true },
    colorHint:'tropical turquoise and warm coral', fontHint:'adventurous bold sans',
    pages:['Homepage','Destinations','Packages','Group Travel','Blog','About','Contact'],
    tags:['travel','vacation','packages','destinations','tours','luxury'] }),

  t({ id:'trv-003', name:'Vacation Rental', industry:'Vacation Rental / Airbnb', purpose:'rental', category:'Travel & Hospitality',
    description:'A premium vacation rental property management company offering beautiful short-term rentals.',
    defaultFeatures:{ booking:true, gallery:true, testimonials:true, faq:true, contact:true },
    colorHint:'warm sunset orange and ocean blue', fontHint:'relaxed clean sans',
    pages:['Homepage','Properties','Book Now','Amenities','Local Guide','Reviews','Contact'],
    tags:['vacation rental','airbnb','rental','travel','property'] }),

  // ── CONSTRUCTION & TRADES ────────────────────────────────────────────────
  t({ id:'con-001', name:'General Contractor', industry:'Construction / Contracting', purpose:'contractor', category:'Construction & Trades',
    description:'A licensed general contractor handling residential and commercial construction, renovation, and remodeling.',
    defaultFeatures:{ portfolio:true, leadCapture:true, testimonials:true, faq:true, contact:true }, popular:true,
    colorHint:'strong yellow and dark gray', fontHint:'industrial bold sans',
    pages:['Homepage','Services','Projects','About','Reviews','Get Quote','Contact'],
    tags:['contractor','construction','renovation','building','remodeling'] }),

  t({ id:'con-002', name:'Plumbing Services', industry:'Plumbing', purpose:'trades', category:'Construction & Trades',
    description:'A licensed plumbing company offering emergency repairs, installations, drain cleaning, and water heaters.',
    defaultFeatures:{ leadCapture:true, faq:true, testimonials:true, booking:true, contact:true },
    colorHint:'trustworthy blue and clean white', fontHint:'reliable bold sans',
    pages:['Homepage','Services','Emergency Service','Reviews','About','Contact'],
    tags:['plumbing','plumber','emergency','drain','water heater'] }),

  t({ id:'con-003', name:'Interior Design Studio', industry:'Interior Design', purpose:'design studio', category:'Construction & Trades',
    description:'A boutique interior design studio transforming residential and commercial spaces with distinctive design.',
    defaultFeatures:{ portfolio:true, gallery:true, leadCapture:true, team:true, blog:true, contact:true },
    colorHint:'sophisticated warm white and deep forest green', fontHint:'editorial fashion-forward sans',
    pages:['Homepage','Portfolio','Process','Services','About','Blog','Contact'],
    tags:['interior design','decor','renovation','architecture','studio'] }),

  // ── BEAUTY & LIFESTYLE ───────────────────────────────────────────────────
  t({ id:'bty-001', name:'Hair Salon & Spa', industry:'Hair Salon / Beauty', purpose:'salon', category:'Beauty & Lifestyle',
    description:'A full-service hair salon and day spa offering haircuts, color, facials, massage, and nails.',
    defaultFeatures:{ booking:true, pricing:true, gallery:true, team:true, testimonials:true, contact:true }, popular:true,
    colorHint:'sophisticated rose and warm champagne', fontHint:'glamorous elegant serif',
    pages:['Homepage','Services','Book Now','Our Team','Gallery','Gift Cards','Contact'],
    tags:['salon','spa','hair','beauty','nails','massage'] }),

  t({ id:'bty-002', name:'Tattoo & Piercing Studio', industry:'Tattoo / Body Art', purpose:'studio', category:'Beauty & Lifestyle',
    description:'A professional tattoo and piercing studio specializing in custom tattoos, fine line, and body jewelry.',
    defaultFeatures:{ gallery:true, booking:true, team:true, faq:true, contact:true },
    colorHint:'dramatic dark with accent colors', fontHint:'alternative edgy sans',
    pages:['Homepage','Artists','Gallery','Book Appointment','Aftercare','FAQ','Contact'],
    tags:['tattoo','piercing','body art','studio','custom'] }),

  // ── AUTOMOTIVE ──────────────────────────────────────────────────────────
  t({ id:'aut-001', name:'Auto Dealership', industry:'Automotive / Car Dealership', purpose:'dealership', category:'Automotive',
    description:'A new and used car dealership offering financing, trade-ins, and certified pre-owned vehicles.',
    defaultFeatures:{ leadCapture:true, ecommerce:true, testimonials:true, faq:true, contact:true },
    colorHint:'premium dark and silver with red accent', fontHint:'sleek automotive sans',
    pages:['Homepage','New Cars','Used Cars','Financing','Service','Trade-In','Contact'],
    tags:['auto','car','dealership','vehicles','financing'] }),

  t({ id:'aut-002', name:'Auto Repair Shop', industry:'Auto Repair / Mechanic', purpose:'auto repair', category:'Automotive',
    description:'A trusted auto repair shop offering oil changes, brakes, tires, engine repair, and diagnostic services.',
    defaultFeatures:{ booking:true, pricing:true, testimonials:true, faq:true, contact:true },
    colorHint:'bold red and grease-gray', fontHint:'tough industrial sans',
    pages:['Homepage','Services','Pricing','Book Service','Reviews','About','Contact'],
    tags:['auto repair','mechanic','car service','oil change','brakes'] }),

  // ── GOVERNMENT & COMMUNITY ──────────────────────────────────────────────
  t({ id:'gov-001', name:'Municipality / City Website', industry:'Local Government', purpose:'government', category:'Government & Community',
    description:'An official city government website providing services, news, permits, and civic engagement resources.',
    defaultFeatures:{ events:true, blog:true, registration:true, stats:true, contact:true },
    colorHint:'official navy and patriotic red-white', fontHint:'official accessible sans',
    pages:['Homepage','Departments','Services','News','Events','Permits','Contact'],
    tags:['government','city','municipality','civic','public','services'] }),

  t({ id:'gov-002', name:'Community Center', industry:'Community Center / Recreation', purpose:'community', category:'Government & Community',
    description:'A community center offering recreation programs, fitness classes, after-school care, and event rentals.',
    defaultFeatures:{ events:true, registration:true, members:true, pricing:true, gallery:true, contact:true }, popular:true,
    colorHint:'friendly multi-color on clean white', fontHint:'approachable community sans',
    pages:['Homepage','Programs','Events','Membership','Rent Space','Gallery','Contact'],
    tags:['community','recreation','programs','fitness','events','center'] }),

  t({ id:'gov-003', name:'Political Campaign', industry:'Political Campaign', purpose:'campaign', category:'Government & Community',
    description:'A political campaign website for a mayoral candidate focused on economic development and public safety.',
    defaultFeatures:{ donations:true, volunteers:true, events:true, newsletter:true, registration:true, contact:true },
    colorHint:'patriotic red, white and blue', fontHint:'bold decisive sans',
    pages:['Homepage','Platform','Events','Volunteer','Donate','News','Contact'],
    tags:['political','campaign','election','vote','candidate'] }),

  // ── FINANCE & FINTECH ───────────────────────────────────────────────────
  t({ id:'fin-001', name:'Financial Advisor', industry:'Financial Advisory', purpose:'finance', category:'Finance & Fintech',
    description:'An independent financial advisor helping individuals and families build wealth through smart investing.',
    defaultFeatures:{ leadCapture:true, blog:true, team:true, faq:true, testimonials:true, contact:true },
    colorHint:'trustworthy navy and forest green', fontHint:'authoritative classic sans',
    pages:['Homepage','Services','About','Resources','Blog','Book Consultation','Contact'],
    tags:['financial','advisor','wealth','investing','retirement'] }),

  t({ id:'fin-002', name:'Credit Union', industry:'Credit Union / Banking', purpose:'banking', category:'Finance & Fintech',
    description:'A member-owned credit union offering checking, savings, loans, and mortgage products with better rates.',
    defaultFeatures:{ members:true, registration:true, leadCapture:true, faq:true, blog:true, contact:true },
    colorHint:'community green and trustworthy blue', fontHint:'reliable open sans',
    pages:['Homepage','Banking','Loans','Mortgage','Business','Membership','Contact'],
    tags:['credit union','banking','loans','savings','mortgage','member'] }),

  // ── AGRICULTURE & ENVIRONMENT ───────────────────────────────────────────
  t({ id:'agr-001', name:'Farm & Agritourism', industry:'Agriculture / Farm', purpose:'farm', category:'Agriculture & Environment',
    description:'A working family farm offering farm tours, u-pick experiences, a farm stand, and seasonal events.',
    defaultFeatures:{ events:true, ecommerce:true, gallery:true, newsletter:true, contact:true },
    colorHint:'earthy rust and forest green', fontHint:'rustic handcrafted serif',
    pages:['Homepage','What We Grow','Events','Farm Stand','U-Pick','About','Contact'],
    tags:['farm','agriculture','organic','seasonal','agritourism','local'] }),

  t({ id:'agr-002', name:'Solar Energy Company', industry:'Renewable Energy / Solar', purpose:'solar', category:'Agriculture & Environment',
    description:'A solar energy installation company helping homeowners and businesses switch to clean energy.',
    defaultFeatures:{ leadCapture:true, pricing:true, testimonials:true, faq:true, contact:true }, new:true,
    colorHint:'solar orange and sky blue', fontHint:'clean tech sans',
    pages:['Homepage','How It Works','Products','Savings Calculator','Reviews','FAQ','Contact'],
    tags:['solar','energy','renewable','installation','green','sustainable'] }),

  // ── ADDITIONAL POPULAR TEMPLATES ────────────────────────────────────────
  t({ id:'gen-001', name:'Personal Brand / Speaker', industry:'Personal Brand / Thought Leader', purpose:'personal', category:'Creative & Portfolio',
    description:'A professional personal brand website for a keynote speaker, author, and business coach.',
    defaultFeatures:{ leadCapture:true, blog:true, events:true, testimonials:true, booking:true, newsletter:true }, popular:true,
    colorHint:'bold personal brand colors', fontHint:'confident display serif',
    pages:['Homepage','About','Speaking','Books','Podcast','Blog','Book Me','Contact'],
    tags:['personal brand','speaker','coach','author','consultant'] }),

  t({ id:'gen-002', name:'Photographer / Videographer', industry:'Photography / Videography', purpose:'portfolio', category:'Creative & Portfolio',
    description:'A professional photographer specializing in weddings, portraits, commercial, and lifestyle photography.',
    defaultFeatures:{ gallery:true, portfolio:true, booking:true, pricing:true, contact:true }, popular:true,
    colorHint:'cinematic dark mode with warm film tones', fontHint:'editorial minimal',
    pages:['Homepage','Portfolio','Services','Pricing','About','Book a Session','Contact'],
    tags:['photography','photographer','portfolio','wedding','commercial'] }),

  t({ id:'gen-003', name:'Podcast / Media Brand', industry:'Podcast / Media', purpose:'media', category:'Creative & Portfolio',
    description:'A popular podcast brand covering entrepreneurship, mindset, and life optimization for high achievers.',
    defaultFeatures:{ blog:true, newsletter:true, events:true, ecommerce:true, leadCapture:true, contact:true },
    colorHint:'bold dark with accent neon', fontHint:'media-forward display sans',
    pages:['Homepage','Episodes','Guests','Shop','Newsletter','About','Contact'],
    tags:['podcast','media','content','episodes','newsletter','brand'] }),

  t({ id:'gen-004', name:'Consultant / Coach', industry:'Consulting / Business Coaching', purpose:'consulting', category:'Legal & Professional',
    description:'A business growth consultant helping SMBs scale revenue, build systems, and develop leadership.',
    defaultFeatures:{ leadCapture:true, pricing:true, testimonials:true, blog:true, booking:true, contact:true }, popular:true,
    colorHint:'premium dark charcoal and gold', fontHint:'authoritative refined sans',
    pages:['Homepage','Services','Results','About','Resources','Book Call','Contact'],
    tags:['consultant','coach','business','strategy','growth'] }),

  t({ id:'gen-005', name:'Mobile App Landing Page', industry:'Mobile App', purpose:'app', category:'Technology & SaaS',
    description:'A mobile app for personal finance tracking with budgeting, investment insights, and savings goals.',
    defaultFeatures:{ pricing:true, leadCapture:true, testimonials:true, faq:true, stats:true }, new:true,
    colorHint:'modern gradient and dark UI', fontHint:'app-forward geometric sans',
    pages:['Homepage','Features','Pricing','Download','FAQ','Blog','Contact'],
    tags:['app','mobile','fintech','download','startup','product'] }),
];

// ── Search and filter helpers ─────────────────────────────────────────────────
export function searchTemplates(query: string): WebsiteTemplate[] {
  if (!query.trim()) return TEMPLATES;
  const q = query.toLowerCase();
  return TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.industry.toLowerCase().includes(q) ||
    t.purpose.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.category.toLowerCase().includes(q) ||
    t.tags.some(tag => tag.includes(q))
  );
}

export function getTemplatesByCategory(category: string): WebsiteTemplate[] {
  return TEMPLATES.filter(t => t.category === category);
}

export function getPopularTemplates(): WebsiteTemplate[] {
  return TEMPLATES.filter(t => t.popular);
}

export function getNewTemplates(): WebsiteTemplate[] {
  return TEMPLATES.filter(t => t.new);
}

export function getTemplateById(id: string): WebsiteTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function getAllTemplates(params?: { q?: string; category?: string }): {
  templates: WebsiteTemplate[];
  categories: string[];
  pageTypes: string[];
  total: number;
} {
  let templates = TEMPLATES;
  if (params?.q) {
    templates = searchTemplates(params.q);
  }
  if (params?.category) {
    templates = templates.filter(t => t.category === params.category);
  }
  return {
    templates,
    categories: TEMPLATE_CATEGORIES,
    pageTypes: PAGE_TYPES,
    total: templates.length,
  };
}
