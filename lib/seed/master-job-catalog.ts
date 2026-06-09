type CatalogJobStatus = "DRAFT" | "ACTIVE" | "RETIRED" | "NEEDS_REVIEW";

export type MasterJobCatalogEntry = {
  title: string;
  internalName?: string;
  department: string;
  category: string;
  location?: string;
  secondaryLocation?: string;
  positionType?: string;
  salaryRange?: string;
  reportsTo?: string;
  status?: CatalogJobStatus;
};

export const masterJobCatalog: MasterJobCatalogEntry[] = [
  {
    title: "Gulfstream G450 & GV Captain (Home-Based)",
    internalName: "G450 GV Captain - PDF Master",
    department: "Flight Operations",
    category: "FlightOps",
    location: "SLC",
    secondaryLocation: "Home Based",
    positionType: "Full Time",
    salaryRange: "$230,000"
  },
  {
    title: "Gulfstream G450 & GV First Officer (Home-Based) $15k Sign-on bonus!",
    department: "Flight Operations",
    category: "FlightOps",
    location: "SLC",
    secondaryLocation: "Home Based",
    positionType: "Full Time",
    salaryRange: "$120,000"
  },
  { title: "Gulfstream G200 Captain", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$160,000" },
  { title: "Gulfstream G200 First Officer", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$110,000" },
  { title: "Citation 560XL Captain", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$160,000" },
  { title: "Citation 560XL First Officer", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$100,000" },
  { title: "Citation CE-525 (CJ2) Captain $10k Sign-on bonus!", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$125,000" },
  { title: "Citation CE-525 First Officer", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$65,000" },
  { title: "Pilatus PC-12 Captain", department: "Flight Operations", category: "FlightOps", location: "OGD", positionType: "Full Time", salaryRange: "$90,000-$100,000" },
  { title: "Pilatus PC-12 First Officer", department: "Flight Operations", category: "FlightOps", location: "OGD", positionType: "Full Time", salaryRange: "$40,000" },
  { title: "Gulfstream G450 Lead Captain", department: "Managed Aircraft", category: "FlightOps", location: "HND", positionType: "Full Time" },
  { title: "Gulfstream G450 Captain", department: "Managed Aircraft", category: "FlightOps", location: "HND", positionType: "Full Time" },
  { title: "Gulfstream G450 First Officer", department: "Managed Aircraft", category: "FlightOps", location: "HND", positionType: "Full Time" },
  { title: "G450 Aircraft Maintenance Technician", department: "Maintenance", category: "Maintenance", location: "HND", positionType: "Full Time" },
  { title: "G450 Lead Cabin Attendant", department: "Flight Operations", category: "FlightOps", location: "HND", positionType: "Full Time", salaryRange: "$80,000" },
  { title: "Legacy 650 Lead Captain", department: "Managed Aircraft", category: "FlightOps", location: "SLC", positionType: "Full Time" },
  { title: "Legacy 650 Captain", department: "Managed Aircraft", category: "FlightOps", location: "SLC", positionType: "Full Time" },
  { title: "Legacy 650 First Officer", department: "Managed Aircraft", category: "FlightOps", location: "SLC", positionType: "Full Time" },
  { title: "Citation CE-525 CJ Captain", department: "Managed Aircraft", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$140k-$160k" },
  { title: "Citation 560XLS+ Captain", department: "Managed Aircraft", category: "FlightOps", location: "OGD", positionType: "Full Time", salaryRange: "$160,000" },
  { title: "Citation 560XLS+ First Officer", department: "Managed Aircraft", category: "FlightOps", location: "OGD", positionType: "Full Time", salaryRange: "$100,000" },
  { title: "Citation CE-525 (M2) Lead Captain", department: "Managed Aircraft", category: "FlightOps", location: "OGD", positionType: "Full Time", salaryRange: "$145k-$160k" },
  { title: "PC-12 Captain & CE-525 First Officer", department: "Managed Aircraft", category: "FlightOps", location: "OGD", positionType: "Full Time", salaryRange: "$120k" },
  { title: "Phenom 100 Captain", department: "Managed Aircraft", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$150k-$160k" },
  { title: "Phenom 100 First Officer", department: "Managed Aircraft", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$60k-$70k" },
  { title: "Pilatus PC-12 NG Captain - BMC", department: "Managed Aircraft", category: "FlightOps", location: "BMC", positionType: "Full Time" },
  { title: "Pilatus PC-12 NG Captain - SLC", department: "Managed Aircraft", category: "FlightOps", location: "SLC", positionType: "Full Time" },
  { title: "Chief Pilot", department: "Flight Operations", category: "Operations", location: "SLC", positionType: "Full Time" },
  { title: "Assistant Chief Pilot", department: "Flight Operations", category: "Operations", location: "SLC", positionType: "Full Time" },
  { title: "Flight Operations Manager", department: "Flight Operations", category: "Operations", location: "SLC", positionType: "Full Time" },
  { title: "SkyOps Flight Coordinator", department: "Flight Operations", category: "Operations", location: "SLC", positionType: "Full Time" },
  { title: "Charter Sales Coordinator", department: "Flight Operations", category: "Operations", location: "SLC", positionType: "Full Time" },
  { title: "Director of Safety (Aviation)", department: "Flight Operations", category: "Operations", location: "SLC", positionType: "Full Time" },
  { title: "Lead Corporate Cabin Attendant", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$100k-$120k" },
  { title: "Corporate Cabin Attendant", department: "Flight Operations", category: "FlightOps", location: "SLC", positionType: "Full Time", salaryRange: "$70k-$80k DOE" },
  { title: "Fleet Aircraft Maintenance Technician (AMT)", department: "Maintenance", category: "Maintenance", location: "SLC - Salt Lake City, UT", positionType: "Full Time", salaryRange: "$40-$47 per hour, DOE" },
  { title: "Afternoon Team Aircraft Maintenance Technician (AMT)", department: "Maintenance", category: "Maintenance", location: "OGD - Ogden, UT", positionType: "Full Time", salaryRange: "$40-$47 per hour, DOE" },
  { title: "Afternoon Shift Lead Aircraft Maintenance Technician (AMT)", department: "Maintenance", category: "Maintenance", location: "OGD - Ogden, UT", positionType: "Full Time", salaryRange: "$45-$52 per hour, DOE" },
  { title: "Aircraft Maintenance Technician (AMT) - Old", department: "Maintenance", category: "Maintenance", location: "OGD - Ogden, UT", positionType: "Full Time", salaryRange: "$35-$45 per hour", status: "RETIRED" },
  { title: "Senior Gulfstream Technician (AMT) - Old", department: "Maintenance", category: "Maintenance", location: "SLC - Salt Lake City, UT", positionType: "Full Time", status: "RETIRED" },
  { title: "Aircraft Maintenance Apprentice", department: "Maintenance", category: "Maintenance", location: "OGD & SLC", positionType: "Part-Time", salaryRange: "$19/hour" },
  { title: "Customer Service Supervisor (Aviation)", department: "FBO", category: "FBO", location: "SLC", positionType: "Full Time" },
  { title: "Customer Service Representative (Aviation) - OGD", department: "FBO", category: "FBO", location: "OGD", positionType: "Full-Time/Part-Time", salaryRange: "Negotiable Pay" },
  { title: "Line Service Manager", department: "FBO", category: "FBO", location: "SLC", positionType: "Full Time" },
  { title: "Aircraft Detailing & Presentation Specialist", department: "FBO", category: "FBO", location: "SLC", positionType: "Full-Time", salaryRange: "$19.00" },
  { title: "Line Service Technician - OGD/DVO", department: "FBO", category: "FBO", location: "OGD/DVO", positionType: "Full-Time/Part-Time", salaryRange: "$17/hour OGD / $22/hour DVO" },
  { title: "Maintenance and Facilities Coordinator", department: "FBO", category: "FBO", location: "SLC", positionType: "Full Time" },
  { title: "Line Service Technician (Aviation) - DVO", department: "FBO", category: "FBO", location: "Gnoss Field Airport (DVO)", positionType: "Part-Time", salaryRange: "$23.00 per hour DOE" },
  { title: "FBO Manager", department: "FBO", category: "FBO", location: "Gnoss Field Airport (DVO)", positionType: "Full-Time", salaryRange: "$70k-$85k" },
  { title: "Line Service Technician (Aviation) - SVR", department: "FBO", category: "FBO", location: "South Valley Regional Airport (SVR)", positionType: "Full-Time / Part-Time", salaryRange: "$18.00-$23.50 per hour DOE" },
  { title: "Line Service Manager (Aviation)", department: "FBO", category: "FBO", location: "South Valley Regional Airport (SVR)", positionType: "Full-Time", salaryRange: "$25.00-$30.00 per hour DOE" },
  { title: "Facilities & Maintenance Manager (Aviation)", department: "FBO", category: "FBO", location: "South Valley Regional Airport (SVR)", positionType: "Full-Time", salaryRange: "$70,000-$80,000 annually DOE" },
  { title: "Customer Service Representative (Aviation) - SVR", department: "FBO", category: "FBO", location: "South Valley Regional Airport (SVR)", positionType: "Full-Time or Part-Time", salaryRange: "$18.50-$22.00 per hour DOE" },
  { title: "FBO Customer Service & Front Office Manager (Aviation)", department: "FBO", category: "FBO", location: "South Valley Regional Airport (SVR)", positionType: "Full-Time", salaryRange: "$50,000-$60,000 annually DOE" },
  { title: "Accounts Receivable Specialist", department: "Accounting", category: "Accounting", location: "SLC", positionType: "Full Time" },
  { title: "Accounts Payable Specialist", department: "Accounting", category: "Accounting", location: "SLC", positionType: "Full Time" },
  { title: "AP/AR Specialist", department: "Accounting", category: "Accounting", location: "SLC", positionType: "Full Time" },
  { title: "Assistant Controller", department: "Accounting", category: "Accounting", location: "SLC", positionType: "Full Time" },
  { title: "Financial Controller 2 (Starting at 110k+)", department: "Accounting", category: "Accounting", location: "SLC", positionType: "Full Time", salaryRange: "Starting at $110k+" },
  { title: "Aircraft Management Sales Manager", department: "Sales", category: "Sales", location: "SLC", positionType: "Full Time" },
  { title: "Outbound Appointment Setter (Part-Time)", department: "Sales", category: "Sales", location: "Remote", positionType: "Part-Time" },
  { title: "Aircraft Market Research Analyst", department: "Sales", category: "Sales", location: "SLC", positionType: "Full Time" },
  { title: "OpenJet Sales Advisor", department: "Sales", category: "Sales", location: "SLC", positionType: "Full Time" },
  { title: "VP of Aircraft Sales (Brokerage)", department: "Sales", category: "Sales", location: "SLC - Salt Lake City, UT, 84116", secondaryLocation: "Remote", positionType: "Full Time" },
  { title: "VP of Marketing", department: "Marketing", category: "Marketing", location: "SLC - Salt Lake City, UT, 84116", positionType: "Full Time" },
  { title: "VP of Managed Client Aircraft Services", department: "Sales", category: "Executive", location: "SLC - Salt Lake City, UT, 84116", positionType: "Full Time" },
  { title: "Social Media Manager", department: "Marketing", category: "Marketing", location: "SLC - Salt Lake City, UT", positionType: "Full Time" },
  { title: "HR Administrative Assistant", department: "Human Resources", category: "Human Resources", location: "SLC", positionType: "Full Time" },
  { title: "HR Generalist", department: "Human Resources", category: "Human Resources", location: "SLC", positionType: "Full Time" },
  { title: "Director of HR", department: "Human Resources", category: "Human Resources", location: "SLC", positionType: "Full Time" },
  { title: "Lift Pilatus PC-12 Captain (link)", department: "Retired Managed Aircraft", category: "FlightOps", location: "CHS", positionType: "Full Time", salaryRange: "$80,000", status: "RETIRED" },
  { title: "Lift Pilatus PC-12 First Officer (link)", department: "Retired Managed Aircraft", category: "FlightOps", location: "CHS", positionType: "Full Time", salaryRange: "$30,000", status: "RETIRED" },
  { title: "Pilatus PC-12 NGX Lead Captain", department: "Retired Managed Aircraft", category: "FlightOps", positionType: "Full Time", status: "RETIRED" },
  { title: "Citation CE525 Captain", department: "Retired Managed Aircraft", category: "FlightOps", positionType: "Full Time", status: "RETIRED" },
  { title: "Citation M2 First Officer", department: "Retired Managed Aircraft", category: "FlightOps", positionType: "Full Time", status: "RETIRED" }
];
