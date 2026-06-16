import { Users, TrendingUp, Clock, DollarSign, Calendar, Briefcase, UserCheck, FileText, Phone, Mail, Target, Award, Heart, BookOpen, Building, GraduationCap, Receipt, ArrowDownRight } from "lucide-react";
import type { TeamMember } from "./TeamMemberCard";
import type { Notice } from "./NoticeCard";
import type { Activity } from "./ActivityFeed";
import type { Contact } from "./ContactCard";
import type { Column } from "./DataTable";

// ============= CRM Module =============
export const crmContacts: Contact[] = [];
export const crmActivities: Activity[] = [];
export const crmTableData: any[] = [];

export const crmColumns: Column<any>[] = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status", render: (v) => String(v as string) },
  { key: "role", label: "Role" },
  { key: "email", label: "Email" },
  { key: "lastContact", label: "Last Contact" },
];

export const crmStats = [
  { label: "Total Leads", value: "-", icon: Users, gradient: "from-primary to-flyn-purple-deep" },
  { label: "Qualified", value: "-", icon: Target, trend: { value: "0% this week", positive: true }, gradient: "from-flyn-cyan to-primary" },
  { label: "Deals Won", value: "-", icon: DollarSign, gradient: "from-status-active to-flyn-cyan" },
  { label: "Conversion", value: "-", icon: TrendingUp, trend: { value: "0%", positive: true }, gradient: "from-primary to-flyn-cyan" },
];

// ============= HR Module =============
export const hrTeamMembers: TeamMember[] = [];
export const hrNotices: Notice[] = [];
export const hrPayrollData: any[] = [];
export const hrTableData: any[] = [];

export const hrColumns: Column<any>[] = [
  { key: "name", label: "Employee" },
  { key: "department", label: "Department" },
  { key: "status", label: "Status", render: (v) => String(v as string) },
  { key: "role", label: "Role" },
];

export const hrStats = [
  { label: "Employees", value: "-", icon: Users, gradient: "from-primary to-flyn-purple-deep", featured: true },
  { label: "Attendance", value: "-", icon: UserCheck, gradient: "from-flyn-cyan to-primary" },
  { label: "Leave Requests", value: "-", icon: Clock, gradient: "from-status-pending to-flyn-cyan" },
  { label: "Open Positions", value: "-", icon: Briefcase, gradient: "from-status-active to-primary" },
];

// ============= Events Module =============
export const eventsTableData: any[] = [];

export const eventsColumns: Column<any>[] = [
  { key: "name", label: "Event Name" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status", render: (v) => String(v as string) },
  { key: "attendees", label: "Attendees" },
  { key: "venue", label: "Venue" },
];

export const eventsStats = [
  { label: "Total Events", value: "-", icon: Calendar, gradient: "from-flyn-cyan to-primary" },
  { label: "Attendees", value: "-", icon: Users, gradient: "from-primary to-flyn-purple-deep" },
  { label: "This Week", value: "-", icon: Clock, gradient: "from-status-active to-flyn-cyan" },
  { label: "Revenue", value: "-", icon: DollarSign, gradient: "from-flyn-purple-deep to-primary" },
];

// ============= Church Module =============
export const churchTableData: any[] = [];

export const churchColumns: Column<any>[] = [
  { key: "name", label: "Program" },
  { key: "date", label: "Schedule" },
  { key: "status", label: "Status", render: (v) => String(v as string) },
  { key: "attendance", label: "Attendance" },
  { key: "ministry", label: "Ministry" },
];

export const churchStats = [
  { label: "Members", value: "-", icon: Users, gradient: "from-amber-500 to-orange-500" },
  { label: "Attendance", value: "-", icon: Heart, gradient: "from-pink-500 to-rose-500" },
  { label: "Ministries", value: "-", icon: Building, gradient: "from-primary to-flyn-cyan" },
  { label: "Donations", value: "-", icon: DollarSign, gradient: "from-status-active to-flyn-cyan" },
];

// ============= Coaches Module =============
export const coachesTableData: any[] = [];

export const coachesColumns: Column<any>[] = [
  { key: "name", label: "Coach" },
  { key: "status", label: "Status", render: (v) => String(v as string) },
  { key: "sessions", label: "Sessions" },
  { key: "clients", label: "Clients" },
  { key: "specialty", label: "Specialty" },
];

export const coachesStats = [
  { label: "Active Coaches", value: "-", icon: GraduationCap, gradient: "from-pink-500 to-rose-500" },
  { label: "Total Clients", value: "-", icon: Users, gradient: "from-primary to-flyn-cyan" },
  { label: "Sessions/Week", value: "-", icon: Calendar, gradient: "from-flyn-cyan to-primary" },
  { label: "Revenue", value: "-", icon: DollarSign, gradient: "from-status-active to-flyn-purple-deep" },
];

// ============= Freelancers Module =============
export const freelancersTableData: any[] = [];

export const freelancersColumns: Column<any>[] = [
  { key: "name", label: "Project" },
  { key: "client", label: "Client" },
  { key: "status", label: "Status", render: (v) => String(v as string) },
  { key: "budget", label: "Budget" },
  { key: "deadline", label: "Deadline" },
];

export const freelancersStats = [
  { label: "Active Projects", value: "-", icon: Briefcase, gradient: "from-indigo-500 to-violet-500" },
  { label: "Total Clients", value: "-", icon: Users, gradient: "from-primary to-flyn-cyan" },
  { label: "Revenue MTD", value: "-", icon: DollarSign, gradient: "from-status-active to-flyn-cyan" },
  { label: "Pending Invoices", value: "-", icon: FileText, gradient: "from-status-pending to-primary" },
];

// ============= Accounting Module =============
export const accountingTableData: any[] = [];

export const accountingColumns: Column<any>[] = [
  { key: "invoice", label: "Invoice #" },
  { key: "client", label: "Client" },
  { key: "amount", label: "Amount" },
  { key: "status", label: "Status", render: (v) => String(v as string) },
  { key: "dueDate", label: "Due Date" },
  { key: "module", label: "Source" },
];

export const accountingStats = [
  { label: "Revenue MTD", value: "-", icon: DollarSign, trend: { value: "0% MTD", positive: true }, gradient: "from-emerald-500 to-teal-500" },
  { label: "Outstanding", value: "-", icon: Receipt, trend: { value: "0 invoices", positive: false }, gradient: "from-amber-500 to-orange-500" },
  { label: "Expenses MTD", value: "-", icon: ArrowDownRight, gradient: "from-rose-500 to-pink-500" },
  { label: "Net Profit", value: "-", icon: TrendingUp, trend: { value: "0% YoY", positive: true }, gradient: "from-primary to-flyn-purple-deep" },
];

// Module configuration mapping
export const moduleDataConfig = {
  crm: {
    stats: crmStats,
    tableData: crmTableData,
    columns: crmColumns,
    contacts: crmContacts,
    activities: crmActivities,
    showContactCard: true,
  },
  hr: {
    stats: hrStats,
    tableData: hrTableData,
    columns: hrColumns,
    teamMembers: hrTeamMembers,
    notices: hrNotices,
    payrollData: hrPayrollData,
    showTeamAndNotices: true,
  },
  events: {
    stats: eventsStats,
    tableData: eventsTableData,
    columns: eventsColumns,
  },
  church: {
    stats: churchStats,
    tableData: churchTableData,
    columns: churchColumns,
  },
  coaches: {
    stats: coachesStats,
    tableData: coachesTableData,
    columns: coachesColumns,
  },
  freelancers: {
    stats: freelancersStats,
    tableData: freelancersTableData,
    columns: freelancersColumns,
  },
  accounting: {
    stats: accountingStats,
    tableData: accountingTableData,
    columns: accountingColumns,
  },
};
