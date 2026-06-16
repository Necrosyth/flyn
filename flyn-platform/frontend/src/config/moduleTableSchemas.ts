/**
 * Module Table Schemas
 * --------------------
 * Static map of every Flyn module → tables → columns.
 * Used by module_table_select and module_column_select field renderers
 * in the workflow builder PropertyPanel.
 */

export interface ModuleColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
}

export interface ModuleTable {
  key: string;
  label: string;
  columns: ModuleColumn[];
}

export interface ModuleDefinition {
  key: string;
  label: string;
  icon: string; // emoji
  tables: ModuleTable[];
}

export const MODULE_SCHEMAS: ModuleDefinition[] = [
  {
    key: 'crm',
    label: 'CRM',
    icon: '👥',
    tables: [
      {
        key: 'contacts',
        label: 'Contacts',
        columns: [
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'source', label: 'Lead Source', type: 'text' },
          { key: 'assignedTo', label: 'Assigned To', type: 'text' },
          { key: 'tags', label: 'Tags', type: 'text' },
          { key: 'createdAt', label: 'Created At', type: 'date' },
        ],
      },
      {
        key: 'leads',
        label: 'Leads',
        columns: [
          { key: 'name', label: 'Name', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'score', label: 'Lead Score', type: 'number' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'source', label: 'Source', type: 'text' },
          { key: 'assignedTo', label: 'Assigned To', type: 'text' },
          { key: 'createdAt', label: 'Created At', type: 'date' },
        ],
      },
      {
        key: 'deals',
        label: 'Deals',
        columns: [
          { key: 'title', label: 'Deal Title', type: 'text' },
          { key: 'value', label: 'Deal Value', type: 'number' },
          { key: 'stage', label: 'Pipeline Stage', type: 'select' },
          { key: 'contactId', label: 'Contact', type: 'text' },
          { key: 'assignedTo', label: 'Assigned To', type: 'text' },
          { key: 'closeDate', label: 'Expected Close', type: 'date' },
          { key: 'probability', label: 'Win Probability', type: 'number' },
        ],
      },
      {
        key: 'accounts',
        label: 'Accounts',
        columns: [
          { key: 'name', label: 'Company Name', type: 'text' },
          { key: 'domain', label: 'Domain', type: 'text' },
          { key: 'industry', label: 'Industry', type: 'text' },
          { key: 'size', label: 'Company Size', type: 'text' },
          { key: 'owner', label: 'Account Owner', type: 'text' },
          { key: 'country', label: 'Country', type: 'text' },
        ],
      },
      {
        key: 'tasks',
        label: 'Tasks',
        columns: [
          { key: 'title', label: 'Task Title', type: 'text' },
          { key: 'dueDate', label: 'Due Date', type: 'date' },
          { key: 'assignedTo', label: 'Assigned To', type: 'text' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'priority', label: 'Priority', type: 'select' },
          { key: 'contactId', label: 'Related Contact', type: 'text' },
        ],
      },
      {
        key: 'tickets',
        label: 'Support Tickets',
        columns: [
          { key: 'subject', label: 'Subject', type: 'text' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'priority', label: 'Priority', type: 'select' },
          { key: 'contactId', label: 'Contact', type: 'text' },
          { key: 'assignedTo', label: 'Assigned Agent', type: 'text' },
          { key: 'createdAt', label: 'Created At', type: 'date' },
        ],
      },
    ],
  },
  {
    key: 'events',
    label: 'Events',
    icon: '📅',
    tables: [
      {
        key: 'events',
        label: 'Events',
        columns: [
          { key: 'title', label: 'Event Title', type: 'text' },
          { key: 'date', label: 'Event Date', type: 'date' },
          { key: 'venue', label: 'Venue', type: 'text' },
          { key: 'capacity', label: 'Capacity', type: 'number' },
          { key: 'registrations', label: 'Registrations', type: 'number' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'category', label: 'Category', type: 'text' },
        ],
      },
      {
        key: 'registrations',
        label: 'Registrations',
        columns: [
          { key: 'name', label: 'Attendee Name', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'eventId', label: 'Event', type: 'text' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'paidAt', label: 'Payment Date', type: 'date' },
          { key: 'ticketType', label: 'Ticket Type', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'hr',
    label: 'HR',
    icon: '🏢',
    tables: [
      {
        key: 'employees',
        label: 'Employees',
        columns: [
          { key: 'name', label: 'Full Name', type: 'text' },
          { key: 'email', label: 'Work Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'department', label: 'Department', type: 'text' },
          { key: 'role', label: 'Job Title', type: 'text' },
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'manager', label: 'Manager', type: 'text' },
        ],
      },
      {
        key: 'interviews',
        label: 'Interviews',
        columns: [
          { key: 'candidateName', label: 'Candidate Name', type: 'text' },
          { key: 'email', label: 'Candidate Email', type: 'text' },
          { key: 'role', label: 'Role Applied For', type: 'text' },
          { key: 'date', label: 'Interview Date', type: 'date' },
          { key: 'interviewer', label: 'Interviewer', type: 'text' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'result', label: 'Result', type: 'select' },
        ],
      },
      {
        key: 'jobs',
        label: 'Job Listings',
        columns: [
          { key: 'title', label: 'Job Title', type: 'text' },
          { key: 'department', label: 'Department', type: 'text' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'deadline', label: 'Application Deadline', type: 'date' },
          { key: 'applicants', label: 'Applicant Count', type: 'number' },
          { key: 'location', label: 'Location', type: 'text' },
        ],
      },
      {
        key: 'leave_requests',
        label: 'Leave Requests',
        columns: [
          { key: 'employeeId', label: 'Employee', type: 'text' },
          { key: 'type', label: 'Leave Type', type: 'select' },
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'endDate', label: 'End Date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'approvedBy', label: 'Approved By', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'church',
    label: 'Church',
    icon: '⛪',
    tables: [
      {
        key: 'members',
        label: 'Members',
        columns: [
          { key: 'name', label: 'Full Name', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'group', label: 'Cell Group', type: 'text' },
          { key: 'joinDate', label: 'Join Date', type: 'date' },
          { key: 'status', label: 'Membership Status', type: 'select' },
          { key: 'birthday', label: 'Birthday', type: 'date' },
        ],
      },
      {
        key: 'services',
        label: 'Services',
        columns: [
          { key: 'title', label: 'Service Title', type: 'text' },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'attendance', label: 'Attendance', type: 'number' },
          { key: 'location', label: 'Location', type: 'text' },
          { key: 'speaker', label: 'Speaker', type: 'text' },
          { key: 'series', label: 'Series', type: 'text' },
        ],
      },
      {
        key: 'groups',
        label: 'Groups / Cells',
        columns: [
          { key: 'name', label: 'Group Name', type: 'text' },
          { key: 'leader', label: 'Group Leader', type: 'text' },
          { key: 'schedule', label: 'Meeting Schedule', type: 'text' },
          { key: 'memberCount', label: 'Member Count', type: 'number' },
          { key: 'category', label: 'Category', type: 'text' },
        ],
      },
      {
        key: 'giving',
        label: 'Giving Records',
        columns: [
          { key: 'memberId', label: 'Member', type: 'text' },
          { key: 'amount', label: 'Amount', type: 'number' },
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'type', label: 'Type', type: 'select' },
          { key: 'method', label: 'Payment Method', type: 'text' },
        ],
      },
    ],
  },
  {
    key: 'coaches',
    label: 'Coaches',
    icon: '🎯',
    tables: [
      {
        key: 'clients',
        label: 'Clients',
        columns: [
          { key: 'name', label: 'Client Name', type: 'text' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'plan', label: 'Coaching Plan', type: 'text' },
          { key: 'coach', label: 'Coach', type: 'text' },
          { key: 'startDate', label: 'Start Date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select' },
        ],
      },
      {
        key: 'sessions',
        label: 'Sessions',
        columns: [
          { key: 'clientId', label: 'Client', type: 'text' },
          { key: 'date', label: 'Session Date', type: 'date' },
          { key: 'duration', label: 'Duration (min)', type: 'number' },
          { key: 'notes', label: 'Notes', type: 'text' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'nextSession', label: 'Next Session', type: 'date' },
        ],
      },
      {
        key: 'programs',
        label: 'Programs',
        columns: [
          { key: 'title', label: 'Program Title', type: 'text' },
          { key: 'duration', label: 'Duration (weeks)', type: 'number' },
          { key: 'price', label: 'Price', type: 'number' },
          { key: 'enrollments', label: 'Enrollments', type: 'number' },
          { key: 'status', label: 'Status', type: 'select' },
        ],
      },
    ],
  },
  {
    key: 'freelancers',
    label: 'Freelancers',
    icon: '💼',
    tables: [
      {
        key: 'projects',
        label: 'Projects',
        columns: [
          { key: 'title', label: 'Project Title', type: 'text' },
          { key: 'client', label: 'Client', type: 'text' },
          { key: 'deadline', label: 'Deadline', type: 'date' },
          { key: 'budget', label: 'Budget', type: 'number' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'assignedTo', label: 'Freelancer', type: 'text' },
        ],
      },
      {
        key: 'invoices',
        label: 'Invoices',
        columns: [
          { key: 'number', label: 'Invoice #', type: 'text' },
          { key: 'client', label: 'Client', type: 'text' },
          { key: 'amount', label: 'Amount', type: 'number' },
          { key: 'dueDate', label: 'Due Date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select' },
          { key: 'issuedAt', label: 'Issued Date', type: 'date' },
        ],
      },
      {
        key: 'proposals',
        label: 'Proposals',
        columns: [
          { key: 'title', label: 'Proposal Title', type: 'text' },
          { key: 'client', label: 'Client', type: 'text' },
          { key: 'value', label: 'Value', type: 'number' },
          { key: 'sentAt', label: 'Sent Date', type: 'date' },
          { key: 'status', label: 'Status', type: 'select' },
        ],
      },
    ],
  },
];

export function getModuleByKey(key: string): ModuleDefinition | undefined {
  return MODULE_SCHEMAS.find(m => m.key === key);
}

export function getTableByKey(moduleKey: string, tableKey: string): ModuleTable | undefined {
  return getModuleByKey(moduleKey)?.tables.find(t => t.key === tableKey);
}
