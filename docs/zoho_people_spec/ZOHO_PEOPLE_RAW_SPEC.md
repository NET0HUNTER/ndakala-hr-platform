# Zoho People 5.0 Live Specification (Ndakala Instance Audit)

> **Audit Source:** `https://people.zoho.com/ndakala/zp`  
> **Authenticated Identity:** `1 - Emilio Orina Ogega` (Super Administrator)  
> **Organization:** `Ndakala`  
> **Extraction Mode:** Live Browser DOM + Network XHR/Fetch + Live User Flow Inspection  
> **Associated Visual Evidence:** [docs/zoho_people_spec/screenshots/](file:///c:/Users/Yankees/Downloads/Ndakala_HR_Platform_Complete%20(1)/docs/zoho_people_spec/screenshots)

---

## 1. Global Shell & Navigation Framework

### 1.1 Left Sidebar Icon Rail (68px width)
1. **Ndakala People Emblem / Brand Logo** (Top)
2. **Primary Nav Icons**:
   - `Home` (`#home/...`)
   - `Onboarding` (`#onboarding/...`)
   - `Leave Tracker` (`#leavetracker/...`)
   - `Attendance` (`#attendance/...`)
   - `Time Tracker` (`#timetracker/...`)
   - `Performance` (`#performance/...`)
   - `Files` (`#files/...`)
   - `More` (Pop-over flyout with services: `Employee Engagement`, `HR Letters`, `Travel`, `Tasks`, `Compensation`, `OKR`)
3. **Bottom Pinned Icons**:
   - `Operations` (`#operations/home`)
   - `Reports` (`#reports/...`)

### 1.2 Top Utility Bar
- **Quick Actions Button (`+`)**:
  - Modal split/list: `Candidate`, `Employee`, `Department`, `Designation`, `Leave`, `Address Proof`, `Bonafide Letter`, `Experience Letter`, `Travel Request`, `Travel Expense`, `Task`.
- **Search Employee** (Interactive combobox with instant lookup)
- **Notifications Hub** (Bell icon, alerts/reminders dropdown)
- **Settings (Gear Icon)**: Links to `#settings/service`
- **Profile Avatar**:
  - Quick details: Name (`Emilio Orina Ogega`), Org (`Ndakala`), Role (`Super Administrator`)
  - Items: `Refer and Earn`, `Subscription` (License Usage: 1/10 users + 20 sample records S1–S20), `Clear sample data`, `Accessibility`, `Switch to night mode`, `Sign Out`.

### 1.3 Bottom Utility Bar
- `My Pins`, `Chats`, `Contacts`, `Support Hub`, `Search across Apps`.

---

## 2. Deep Module Specifications & Schemas

### 2.1 Home Module (`#home`)
#### Top Navigation Tabs:
1. **My Space**:
   - `Overview` sub-tabs: `Activities`, `Feeds`, `Profile`, `Approvals`, `Leave`, `Attendance`, `Time Logs`, `Timesheets`, `Jobs`, `Files`, `More`.
   - `Dashboard`: Quick status widgets (Leave balance, attendance punch-in/out, upcoming holidays, company announcements).
   - `Calendar`: Month/week view of personal schedule and company events.
   - `Delegation`: Out-of-office approver reassignment.
2. **Team**:
   - Tabs: `Team Space`, `Reportees`, `Department`, `Team List`, `HR Process`, `Approvals`.
   - Widgets: Team strength counter, Team Availability gauge, Location Diversity bar, Department Wall, Groups, Surveys, Work Anniversary, New Hires, Birthday Buddy, Department Files.
3. **Organization**:
   - Tabs: `Overview` (Services, Location), `Announcements`, `Policies`, `Employee Tree` (visual interactive hierarchy organogram), `Department Tree`, `Department Directory` (cards with check-in status and contact details), `Birthday Folks`, `New Hires`, `Calendar`.

---

### 2.2 Onboarding Module (`#onboarding`)
#### Sub-Menus & Views:
- **Top Tab**: `Candidate` (`#onboarding/candidate/listview`)
- **View Switcher**: `Candidate View` (Default), `Create View`.
- **Data Scope Selector**: `View All Data`, `Reportees + My Data`, `Reportees' Data`, `Direct Reportees' Data`, `My Data`.
- **Actions Bar**: `Add Candidate` (Primary blue button), Full-screen toggle, `Filter` (Drawer with System Filters & 31 field checkboxes), `Import export menu` (`Import`, `Export`, `History Export`, `Bulk File Upload`).
- **Main Table Columns**:
  `Checkbox`, `First name`, `Last name`, `Email ID`, `Official Email`, `Onboarding Status`, `Department`, `Source of Hire`, `Gender`, `Marital status`, `AboutMe`, `Citizenship`, `Nick Name`, `Ask me about/Expertise`, `Date of joining`.
- **Add Candidate Form Schema** (`#onboarding/candidate/add`):
  - **Action Buttons**: `Submit`, `Submit and New`, `Save Draft`, `Cancel`.
  - **Section 1: Candidate Details**:
    - `Email ID` (Textbox, email format, required)
    - `Phone` (Country code combobox default `+254` + Textbox)
    - `Photo` (Upload: Desktop / Zoho WorkDrive / Others; JPG, PNG, GIF, JPEG max 5 MB)
    - `Nick Name` (Textbox)
    - `Ask me about/Expertise` (Textbox)
    - `First name` (Textbox, required)
    - `Last name` (Textbox, required)
    - `Official Email` (Textbox, email format)
  - **Section 2: Address Details**:
    - *Present Address*: `Address line 1` (Textbox), `Address line 2` (Textbox), `City` (Textbox), `Country` (Combobox), `State/Region` (Combobox), `Postal Code` (Textbox).
    - *Permanent Address*: `Same as Present address` (Checkbox toggle) + duplicate address fields.
  - **Section 3: Professional Details**:
    - `Experience` (Textbox / numeric)
    - `Source of Hire` (Combobox: Referral, Direct, Agency, Job Portal, etc. + Quick Add)
    - `Skill Set` (Multi-select combobox)
    - `Highest Qualification` (Combobox)
    - `Additional information` (Textarea)
    - `Date of joining` (Datepicker `dd-MMM-yyyy`)
    - `Location` (Combobox)
    - `Title` (Combobox / Designation)
    - `Current Salary` (Currency input)
    - `Department` (Combobox)
    - `Offer Letter` (File attachment max 5 MB)
    - `Tentative Joining Date` (Datepicker `dd-MMM-yyyy`)
  - **Section 4: Personal Details**:
    - `Gender` (Combobox: Male, Female, Other)
    - `Marital status` (Combobox: Single, Married, Divorced, Widowed)
    - `AboutMe` (Textarea)
    - `Citizenship` (Combobox)
  - **Section 5: Education Details** (Tabular repeating grid, `Add Row`):
    - `School Name` (Textbox)
    - `Degree/Diploma` (Textbox)
    - `Field(s) of Study` (Textbox)
    - `Date of Completion` (Datepicker)
    - `Additional Notes` (Textarea)
  - **Section 6: Experience Details** (Tabular repeating grid, `Add Row`):
    - `Occupation` (Textbox)
    - `Company` (Textbox)
    - `Summary` (Textarea)
    - `Duration` (Computed/display)
    - `Currently Work Here` (Checkbox)
    - `From Date` (Datepicker)
    - `To Date` (Datepicker)
  - **Section 7: Candidate Dependent Details** (Tabular repeating grid, `Add Row`):
    - `Name` (Textbox)
    - `Relationship` (Combobox: Spouse, Child, Parent, Sibling, Other)
    - `Date of birth` (Datepicker)

---

### 2.3 Leave Tracker Module (`#leavetracker`)
#### Top Navigation Tabs:
1. **My Data**:
   - `Leave Summary` (`#leavetracker/mydata/summary-mode:list`): `List View` vs `Calendar View`, date range picker (`01-Jan-2026 - 31-Dec-2026`), Leave entitlement balance cards (Annual Leave, Sick Leave, Maternity/Paternity, Compassionate, Unpaid).
   - `Leave Requests` (`#leavetracker/mydata/applications`): `Leave view` combobox, `Add Request` button, `Filter`, `More` (`Import`, `Export`).
   - `Shift` (`#leavetracker/mydata/employeeshiftmapping`): `Weekly` / `Monthly` views, `Assign shift`, `More`, timeline (`General 9:00 AM - 6:00 PM`).
2. **Team**:
   - `Reportees`: Direct (`4`) vs All (`19`), `Grid View`, `List View`, `Search Employee`.
   - `On Leave`: Today / This Week / Upcoming calendar.
   - `Leave Requests`: Subordinate pending approvals.
3. **Holidays** (`#leavetracker/holiday`):
   - Year selector, `List View` / `Calendar View`, `My Holidays` combobox, `Add Holidays` splitbutton (`Add Single Holiday`, `Import Holidays`), `Filter`, `More`.
- **Apply Leave Form Schema** (`#leavetracker/mydata/applications/add`):
  - `Leave type*` (Combobox: Annual Leave, Casual Leave, Sick Leave, Maternity Leave, Paternity Leave, Unpaid Leave)
  - `Date*`: `From` (`dd-MMM-yyyy`) to `To` (`dd-MMM-yyyy`) with half-day checkboxes (Morning / Afternoon)
  - `Team Email ID` (Textbox for cc notification)
  - `Reason for leave` (Textarea)
  - Actions: `Submit`, `Cancel`.

---

### 2.4 Attendance Module (`#attendance`)
#### Top Navigation Tabs:
1. **My Data**:
   - `Attendance Summary`:
     - Views: `List View`, `Tabular View`, `Calendar View`.
     - Tabular Columns: `Date`, `First In`, `Last Out`, `Total Hours`, `Payable Hours`, `Overtime/Deviation`, `Status` (Present, Absent, On Leave, Holiday), `Shift(s)`, `Regularization`.
     - Check-in Widget: Punch In / Punch Out button with live clock and IP detection.
     - Controls: Period selector (`Weekly`, `Monthly`), `Filter` drawer, `More` (`Days` / `Hours` toggle, `Import`, `Export`, `Audit History`).
   - `Shift`: Employee shift assignment table.
2. **Team**:
   - `Reportees`: Direct / All, `Grid View`, `List View`, `Kanban View` (grouped by In / Out / On Leave).

---

### 2.5 Time Tracker Module (`#timetracker`)
#### Top Navigation Tabs:
1. **My Data**:
   - `Time Logs`: `Log Time` splitbutton (`Daily Log`, `Weekly Log`, `Semi Monthly Log`, `Monthly Log`), `List View` / `Calendar View`, `More` (`Import`, `Export`).
   - `Timesheets`: Period selector, status combobox (`All`, `Draft`, `Submitted`, `Approved`, `Rejected`), `Create Timesheet`, `Filter`, `More`.
   - `Jobs`: Filter tabs (`Employee` / `Department`), `Add Job`, `Filter`, `More`.
   - `Projects`: Filter tabs (`Employee` / `Department`), `Add Project`, `Filter`, `More`.
   - `Job Schedule`: `Day` / `Week` views, `Clone`, pending changes badge, `Published`, weekly timeline grid.
2. **Team**:
   - `Reportees` (`Direct · 4` / `All · 19`, `Grid View` / `List View`), `Timesheets`, `Jobs`, `Projects`, `Clients`, `Job Schedule`.
- **Log Time Form Schema**:
  - `Project Name` (Select + Quick Add modal)
  - `Job Name*` (Select + Quick Add modal)
  - `Work Item` (Textbox)
  - `Date*` (`dd-MMM-yyyy`)
  - `Description` (Textarea)
  - `Hours*`: Radio toggle (`Total hours` / `Start and end time` / `Timer`), inputs for `HH:MM`
  - `Billable Status*`: Combobox (`Billable` / `Non-billable`)
  - `Attachment`: File upload (Desktop / WorkDrive / Others, max 5 MB)
  - Actions: `Submit`, `Cancel`.

---

### 2.6 Performance Module (`#performance`)
#### Top Navigation Tabs:
1. **My Data**:
   - `KRA`: Key Result Areas list and weightages.
   - `Skill Set`: My rated skills and proficiency matrix.
   - `Goals`: Goals list with status (`Not Started`, `In Progress`, `Achieved`, `Deferred`), `Add Goal` button, progress bar.
   - `Competency`: Core organizational and departmental competencies.
   - `Feedback`: Tabs `Received` / `Given`, actions `Request Feedback`, `Provide Feedback` slide-out drawer.
2. **Skill Set Matrix**:
   - Tabs: `Reportees` / `Organization`.
   - Filters: `Select Skills` combobox, `From` / `To` date pickers, `Search`, `Reset`.
- **Add Goals Form Schema**:
  - `Goal Name*` (Textbox)
  - `Start Date` (`dd-MMM-yyyy`)
  - `Due Date*` (`dd-MMM-yyyy`)
  - `Priority` (Combobox: Low, Medium, High, Critical)
  - `Description` (Textarea)
  - `Progress` (Numeric slider/percentage 0-100)
  - Actions: `Submit`, `Save Draft`, `Cancel`.

---

### 2.7 Files Module (`#files`)
#### Sub-Menus & Architecture:
- **Top Tabs**:
  - `My Files`: `Shared with Me`, `Shared with My Role`.
  - `Team`: `Department Files`, `Reportees`, `Reportee Files`.
  - `Organization`: Corporate repository.
- **Views & Actions**:
  - Views: `List View`, `Folder view`.
  - Buttons: `Filter`, `Manage` (routes to `#operations/files/loc`).
- **Operations Files Management Hub (`#operations/files/...`)**:
  - `Organization Files`: Corporate folders (`Policies & Guidelines`, `Benefits & Insurance`, `Compensation & Payroll`, `Compliance & Statutory`), `Filter`, `Export`, `+ Add Organization Files`.
  - `Employee Files`: Personal staff vaults (IDs, contracts, educational certificates).
  - `HR Forms & Templates`: Document templates (e.g. `Company Handbook Template`, `Address Proof & Employment Confirmation Form`, `Certificate of Service Form`), metadata (`Created on dd-MMM-yyyy`), inline preview, download, edit, delete.
  - `Folders`: Folder hierarchy manager.

---

### 2.8 More Services Flyout Modules
1. **Employee Engagement (`#employeeengagement`)**:
   - `My Data`: Active surveys assigned to employee.
   - `Surveys`: Company-wide satisfaction, pulse surveys, `eNPS` score tracking.
2. **HR Letters (`#hrservices`)**:
   - Sub-modules: `Address Proof`, `Bonafide Letter`, `Experience Letter`.
   - List View: Scope selector (`View All Data`, `Reportees + My Data`), `Add Record`, `Filter`, `Import export menu`.
3. **Travel (`#travel`)**:
   - Sub-modules: `Travel Request`, `Travel Expense`.
   - **Add Travel Request Schema**:
     `Employee ID*` (Combobox), `Place of visit` (Textbox), `Employee Department` (Select + Quick Add), `Expected date of arrival` (Datepicker), `Expected date of departure` (Datepicker), `Expected duration in days` (Numeric), `Purpose of visit` (Textarea), `Customer name` (Textbox), `Is billable to customer` (Select: Yes/No); Actions: `Submit`, `Submit and New`, `Save Draft`, `Cancel`.
4. **Tasks (`#task`)**:
   - Sub-modules: `Tasks` (`My Tasks`, `Track Tasks`, `All Tasks`, status filters: `Total`, `Open`, `Completed`), `Checklists` (`Track Checklists`, `Related Checklists`).
   - **Add Task Schema**: `Task owner`, `Task name*`, `Description`, `Start Date`, `Due Date`, `Reminder`, `Priority`, `Status*`; Actions: `Submit`, `Submit and New`, `Cancel`.
5. **Compensation (`#compensation`)**:
   - Sub-modules: `My Data` (My salary structure, payslip history), `Team` (Direct reportee compensation), `Add Salary` (Salary component builder, allowance/deduction ledger).
6. **OKR (`#okr`)**:
   - Sub-modules: `Dashboard`, `My OKRs` (`+ Add Objective` drawer: `Objective name*`, `Period*`, `Description`), `Department OKRs`, `Organization OKRs`.

---

## 3. Operations Module (`#operations/home`)

Contains 17 operational service cards:
1. `Onboarding`
2. `Employee Information`
3. `Leave Tracker`
4. `Attendance`
5. `Shift`
6. `Time Tracker`
7. `Performance`
8. `Files`
9. `Employee Engagement`
10. `HR Letters`
11. `Travel`
12. `Tasks`
13. `Compensation`
14. `Offboarding`
15. `OKR`
16. `Approvals`
17. `Data Administration`

### 3.1 Employee Information (`#operations/organization/employee/listview`)
- **Top Tabs**: `Employees`, `User-specific Operations`, `Insights`, `Departments`, `Designations`, `HR Process`, `Groups`, `More`.
- **4-Step Add Employee Wizard**:
  - *Step 1: Selection* (Methods: `Invitation`, `Zoho Mail`, `Google Workspace`, `Microsoft 365`; active license quota meter).
  - *Step 2: Create User Account* (`Employee ID*` with auto-generation toggle, `First Name*`, `Last Name*`, `Email address*`).
  - *Step 3: Edit User Data* (Prefill core department and designation).
  - *Step 4: Alerts* (Welcome email, login credentials notification).
- **10-Section Employee Profile / Edit Schema**:
  1. **Basic Information**: `Employee ID`, `First Name`, `Last Name`, `Nick name`, `Email address`.
  2. **Work Information**: `Department`, `Location`, `Designation`, `Zoho Role`, `Employment Type` (Full time, Part time, Contract, Intern), `Employee Status` (Active, Probated, Suspended, Exited), `Source of Hire`, `Date of Joining`, `Current Experience` (Computed), `Total Experience` (Computed).
  3. **Hierarchy Information**: `Reporting Manager` (Combobox with employee search).
  4. **Personal Details**: `Date of Birth`, `Age` (Computed), `Gender`, `Marital Status` (Single, Married, Divorced), `About Me`, `Ask me about/Expertise`.
  5. **Contact Details**: `Work Phone Number`, `Extension`, `Seating Location`, `Tags`, `Present Address`, `Permanent Address`, `Personal Mobile Number`, `Personal Email Address`.
  6. **Separation Information**: `Date of Exit`.
  7. **System Fields**: `Added By`, `Added Time`, `Modified By`, `Modified Time`, `Onboarding Status`.
  8. **Work Experience** (Tabular repeating grid, `Add Row`): `Company name`, `Job Title`, `From Date`, `To Date`, `Job Description`, `Relevant` (Yes/No).
  9. **Education Details** (Tabular repeating grid, `Add Row`): `Institute Name`, `Degree/Diploma`, `Specialization`, `Date of Completion`.
  10. **Dependent Details** (Tabular repeating grid, `Add Row`): `Name`, `Relationship`, `Date of Birth`.

### 3.2 Operations Approvals (`#operations/approvals`)
- Top tab: `All Approvals`.
- Filter Pills: `Status : Pending`, `Employee Status : All Active Employee Requests`.
- Multi-action buttons: `Approve`, `Reject`, `Reassign`, `Delegate`.

---

## 4. Reports Module (`#reports`)

### 4.1 Reports Framework
- **Top Tabs**: `My Reports` (`#reports/my`), `Team Reports` (`#reports/team`), `Organization Reports` (`#reports/admin`), `Analytics`, `Schedulers`, `Search Reports`, `Access Permissions`.
- **Export Capabilities**: Direct export to CSV, XLSX, and PDF across all report tables.

### 4.2 Complete Organization Reports Catalogue (47+ Reports)
1. **Employee Information**: Dashboard, Headcount, Employee addition trend, Employee attrition trend, Career History, Distribution, Diversity, Experience wise exit.
2. **Leave Tracker**: Daily leave status, Resource availability, Employee leave balance, Leave booked and balance, Leave type wise summary, Leave encashment details, Loss of pay details, Leave data for payroll.
3. **Attendance**: Daily attendance status, Early/late check-in and check-out, Employee present/absent status, Presence hours break-up, Attendance data for payroll, Muster roll, Consecutive absences.
4. **Time Tracker**: Time Logs, Jobs status, Projects status, Logged hours for Clients, Employee logged hours, Scheduled vs Worked hours, Timesheet data for payroll.
5. **Performance**: Goals, Skill Set, Feedback on employee, Appraisal status, Appraisal ratings, Appraisal score, Nine-box matrix, Feedback on appraisal, Appraisal ratings history, Appraisal score and rating summary, Review extension report.
6. **Files**: Acknowledgement receipts, Consent receipts.
7. **Compensation**: Salary distribution, Current salary, Employee compensation trend, Salary history, Salary Revision History.
8. **OKR**: Objectives, Key Results.

---

## 5. Settings / Administration (`#settings/service`)

Contains 19 configuration service cards:
`Manage Accounts`, `Onboarding`, `Employee Information`, `Leave Tracker`, `Attendance`, `Shifts`, `Time Tracker`, `Performance`, `Files`, `Employee Engagement`, `HR Letters`, `Travel`, `Tasks`, `Compensation`, `Offboarding`, `OKR`, `Marketplace`, `Developer Space`, `Zia`.

### 5.1 Manage Accounts (`#settings/service/accountsetup`)
- **Users**: Views for `All`, `Login Enabled`, `Login Disabled`, `Invited`, `Downgraded`, `Employee Profiles`.
- **Organization Setup**:
  - `Organization Details`: Legal name, trading name, address, contact numbers, primary email, website, base currency, timezone, date format.
  - `Organization Policy`: General rules, leave year start, fiscal year start.
  - `Organization Structure`: Entity hierarchy, subsidiary mapping.
  - `Locations`: Work sites, head office designation, timezone overrides.
  - `Departments`: Department tree, department heads, shared mailboxes.
  - `Designations`: Job bands and grading ladder.
  - `Domains and Rebranding`: Custom domain routing, email white-labeling, brand colors, portal logos.
  - `From Addresses` & `Email Authentication`: SPF / DKIM verification records.
- **User Access Control (RBAC)**:
  - `Roles`: System baseline roles (`Super Administrator`, `Admin`, `Team Member`, `Team Manager`, `Contractor`, `Director`, `Data Protection Officer`) + custom role creation.
  - `Function Based Permissions`: Module-level granular CRUD permissions.
  - `Administrator`: Multi-admin delegation.
  - `Applicability Groups`: Rule-based assignment by location, department, or grade.
- **Automation Engine**:
  - `Workflows`: Event-triggered automation (On-add, On-edit, On-delete, Date-based).
  - `Blueprints`: Multi-state stage transitions with required checklist gates.
  - `Actions`: Email alerts, webhooks, field updates, task assignments.
  - `Templates`: Notification and letter templates.
  - `Workflow & Custom Button Logs`: Execution history.
  - `Scheduler Logs`: Cron automation audit.

### 5.2 Module-Specific Settings Inspected
- **Employee Information Settings**: Policy (Basic details, Employee ID auto-generation format, Employee status lifecycle, Career history, Resources), HR Process, Access Control.
- **Leave Tracker Settings**: Configuration (Methods, Leave Policy, Compensatory Off, Work Calendar, Pay Period, Leave Request options, Holidays, Additional options), Extend Service, Approvals, Automation, Permissions.
- **Time Tracker Settings**: General settings, Timesheet submission cycles, billable rate cards, client visibility.
- **Performance / OKR Settings**: OKR cycle start month, quarterly formula calculation, deviation percentage brackets, location-based OKRs toggle.
