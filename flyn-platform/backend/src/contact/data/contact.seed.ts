export interface ContactLocation {
  id: string;
  country: string;
  country_code: string;
  region?: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
  timezone: string;
  department: string;
  hours: { monday_friday: string; saturday: string; sunday: string };
  agent_count: number;
  agent_available: boolean;
  languages: string[];
  coordinates?: { lat: number; lng: number };
}

export interface LiveAgent {
  id: string;
  name: string;
  department: string;
  location: string;
  status: 'online' | 'offline' | 'busy' | 'away';
  current_chats: number;
  max_chats: number;
  languages: string[];
  average_response_time: number;
  customer_rating: number;
  is_available: boolean;
}

export const STATIC_LOCATIONS: ContactLocation[] = [
  {
    id: 'loc_us_sf', country: 'United States', country_code: 'US', region: 'California',
    address: '123 Innovation Drive, San Francisco, CA 94105', city: 'San Francisco', postal_code: '94105',
    phone: '+1 (612) 4590-542', email: 'hello@myflynai.com', timezone: 'America/Los_Angeles',
    department: 'general',
    hours: { monday_friday: '9:00 AM – 6:00 PM', saturday: '10:00 AM – 4:00 PM', sunday: 'Closed' },
    agent_count: 5, agent_available: true, languages: ['English', 'Spanish'],
    coordinates: { lat: 37.7749, lng: -122.4194 },
  },
  {
    id: 'loc_us_ny', country: 'United States', country_code: 'US', region: 'New York',
    address: '456 Fifth Avenue, New York, NY 10001', city: 'New York', postal_code: '10001',
    phone: '+1 (212) 555-0100', email: 'support@myflynai.com', timezone: 'America/New_York',
    department: 'support',
    hours: { monday_friday: '8:00 AM – 8:00 PM', saturday: '9:00 AM – 5:00 PM', sunday: '12:00 PM – 5:00 PM' },
    agent_count: 8, agent_available: true, languages: ['English', 'Spanish', 'French'],
    coordinates: { lat: 40.7128, lng: -74.006 },
  },
  {
    id: 'loc_ca_toronto', country: 'Canada', country_code: 'CA', region: 'Ontario',
    address: '789 King Street West, Toronto, ON M5H 2Y1', city: 'Toronto', postal_code: 'M5H 2Y1',
    phone: '+1 (416) 555-0200', email: 'sales@myflynai.com', timezone: 'America/Toronto',
    department: 'sales',
    hours: { monday_friday: '9:00 AM – 6:00 PM', saturday: 'Closed', sunday: 'Closed' },
    agent_count: 3, agent_available: true, languages: ['English', 'French'],
    coordinates: { lat: 43.6532, lng: -79.3832 },
  },
  {
    id: 'loc_mx_cdmx', country: 'Mexico', country_code: 'MX', region: 'Mexico City',
    address: 'Paseo de la Reforma 505, 06500 Mexico City', city: 'Mexico City', postal_code: '06500',
    phone: '+52 (55) 4500-0300', email: 'sales@myflynai.com', timezone: 'America/Mexico_City',
    department: 'sales',
    hours: { monday_friday: '9:00 AM – 6:00 PM', saturday: 'Closed', sunday: 'Closed' },
    agent_count: 2, agent_available: false, languages: ['Spanish', 'English'],
    coordinates: { lat: 19.4326, lng: -99.1332 },
  },
  {
    id: 'loc_uk_london', country: 'United Kingdom', country_code: 'GB', region: 'England',
    address: '1 Finsbury Avenue, London EC2M 1AZ', city: 'London', postal_code: 'EC2M 1AZ',
    phone: '+44 (20) 7946-0958', email: 'support@myflynai.com', timezone: 'Europe/London',
    department: 'support',
    hours: { monday_friday: '9:00 AM – 6:00 PM', saturday: 'Closed', sunday: 'Closed' },
    agent_count: 4, agent_available: true, languages: ['English', 'French', 'German'],
    coordinates: { lat: 51.5074, lng: -0.1278 },
  },
  {
    id: 'loc_de_berlin', country: 'Germany', country_code: 'DE', region: 'Berlin',
    address: 'Unter den Linden 77, 10117 Berlin', city: 'Berlin', postal_code: '10117',
    phone: '+49 (30) 2061-3100', email: 'hello@myflynai.com', timezone: 'Europe/Berlin',
    department: 'general',
    hours: { monday_friday: '10:00 AM – 7:00 PM', saturday: 'Closed', sunday: 'Closed' },
    agent_count: 3, agent_available: true, languages: ['German', 'English'],
    coordinates: { lat: 52.52, lng: 13.405 },
  },
  {
    id: 'loc_fr_paris', country: 'France', country_code: 'FR', region: 'Île-de-France',
    address: '47 Avenue des Champs-Élysées, 75008 Paris', city: 'Paris', postal_code: '75008',
    phone: '+33 (1) 4494-0700', email: 'sales@myflynai.com', timezone: 'Europe/Paris',
    department: 'sales',
    hours: { monday_friday: '10:00 AM – 7:00 PM', saturday: 'Closed', sunday: 'Closed' },
    agent_count: 2, agent_available: true, languages: ['French', 'English'],
    coordinates: { lat: 48.8566, lng: 2.3522 },
  },
  {
    id: 'loc_sg_singapore', country: 'Singapore', country_code: 'SG', region: 'Central Region',
    address: '10 Collyer Quay, Singapore 049315', city: 'Singapore', postal_code: '049315',
    phone: '+65 6789-0123', email: 'support@myflynai.com', timezone: 'Asia/Singapore',
    department: 'support',
    hours: { monday_friday: '9:00 AM – 6:00 PM', saturday: '10:00 AM – 4:00 PM', sunday: 'Closed' },
    agent_count: 5, agent_available: true, languages: ['English', 'Mandarin', 'Malay'],
    coordinates: { lat: 1.287, lng: 103.8522 },
  },
  {
    id: 'loc_jp_tokyo', country: 'Japan', country_code: 'JP', region: 'Tokyo',
    address: '1-6-1 Nishi-Shinjuku, Shinjuku Ward, Tokyo 160-0023', city: 'Tokyo', postal_code: '160-0023',
    phone: '+81 (3) 6368-0200', email: 'hello@myflynai.com', timezone: 'Asia/Tokyo',
    department: 'general',
    hours: { monday_friday: '10:00 AM – 7:00 PM', saturday: 'Closed', sunday: 'Closed' },
    agent_count: 4, agent_available: true, languages: ['Japanese', 'English'],
    coordinates: { lat: 35.6762, lng: 139.6503 },
  },
  {
    id: 'loc_au_sydney', country: 'Australia', country_code: 'AU', region: 'New South Wales',
    address: '201 Elizabeth Street, Sydney NSW 2000', city: 'Sydney', postal_code: '2000',
    phone: '+61 (2) 9131-7000', email: 'sales@myflynai.com', timezone: 'Australia/Sydney',
    department: 'sales',
    hours: { monday_friday: '9:00 AM – 5:30 PM', saturday: 'Closed', sunday: 'Closed' },
    agent_count: 3, agent_available: true, languages: ['English'],
    coordinates: { lat: -33.8688, lng: 151.2093 },
  },
];

export const STATIC_AGENTS: LiveAgent[] = [
  { id: 'agent_001', name: 'Sarah Chen', department: 'support', location: 'San Francisco', status: 'online', current_chats: 2, max_chats: 5, languages: ['English', 'Mandarin'], average_response_time: 45, customer_rating: 4.9, is_available: true },
  { id: 'agent_002', name: 'James Wilson', department: 'support', location: 'New York', status: 'online', current_chats: 3, max_chats: 5, languages: ['English', 'Spanish'], average_response_time: 60, customer_rating: 4.8, is_available: true },
  { id: 'agent_003', name: 'Maria Garcia', department: 'sales', location: 'Toronto', status: 'online', current_chats: 1, max_chats: 5, languages: ['English', 'Spanish', 'French'], average_response_time: 30, customer_rating: 4.95, is_available: true },
  { id: 'agent_004', name: 'David Smith', department: 'support', location: 'London', status: 'online', current_chats: 2, max_chats: 5, languages: ['English', 'French'], average_response_time: 50, customer_rating: 4.7, is_available: true },
  { id: 'agent_005', name: 'Sophie Dubois', department: 'sales', location: 'Paris', status: 'away', current_chats: 0, max_chats: 5, languages: ['French', 'English', 'German'], average_response_time: 40, customer_rating: 4.85, is_available: false },
  { id: 'agent_006', name: 'Alex Rivera', department: 'general', location: 'San Francisco', status: 'online', current_chats: 1, max_chats: 5, languages: ['English', 'Spanish'], average_response_time: 35, customer_rating: 4.75, is_available: true },
  { id: 'agent_007', name: 'Priya Patel', department: 'careers', location: 'Singapore', status: 'online', current_chats: 0, max_chats: 5, languages: ['English', 'Hindi'], average_response_time: 25, customer_rating: 4.85, is_available: true },
  { id: 'agent_008', name: 'Lucas Müller', department: 'brand', location: 'Berlin', status: 'online', current_chats: 1, max_chats: 5, languages: ['German', 'English', 'French'], average_response_time: 40, customer_rating: 4.9, is_available: true },
];
