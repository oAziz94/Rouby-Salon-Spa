Software Requirements Specification
Alrouby Salon & Spa Booking & Management System
Document Version
Project: Alrouby Salon & Spa System
Document Type: Software Requirements Specification
Version: 1.0
Prepared For: Alrouby Salon & Spa
Prepared By: System Architecture Planning


1. Introduction
1.1 Purpose
The purpose of this document is to define the full software requirements for the Alrouby Salon & Spa Booking & Management System.
The system will include:
1. Public client website
2. Online booking request system
3. Admin dashboard
4. Role-based management system
5. Services, packages, and bundles management
6. WhatsApp-first communication
7. Client management
8. Staff and branch management
9. Payments, deposits, VAT, and invoicing support
10. Reports and analytics

The goal is to create a professional digital platform that helps Alrouby Salon & Spa manage bookings, clients, services, staff, payments, and communication in a structured and scalable way.

1.2 Project Vision
The system should allow clients to browse services, packages, and bundles, then submit booking requests easily through a modern website.
The salon team should be able to manage these bookings through a powerful internal dashboard with hierarchical roles and permissions.
The system should be flexible enough for the current business stage, but designed in a way that supports future growth, including multiple branches, automated WhatsApp messages, online payments, loyalty programs, inventory, and advanced reports.

2. Overall System Description
2.1 Main System Components
The system consists of two major parts:
1. Public Website
2. Admin Dashboard


2.2 Public Website
The public website allows clients to:
- Browse salon and spa services
- Browse packages
- Browse bundles
- View offers
- View gallery and testimonials
- Contact the salon through WhatsApp
- Register or login
- Submit booking requests
- Select multiple services in one booking
- View booking status and history


2.3 Admin Dashboard
The admin dashboard allows salon staff to:
- Manage bookings
- Manage booking slots
- Confirm, reject, reschedule, or cancel bookings
- Manage clients
- Manage services
- Manage service variants
- Manage packages
- Manage bundles
- Manage staff
- Manage roles and permissions
- Manage VAT settings
- Manage payment and deposit policies
- Manage WhatsApp message templates
- Manage gallery and testimonials
- View reports
- View audit logs


3. Business Objectives
The system should help Alrouby Salon & Spa achieve the following objectives:
1. Increase online booking requests.
2. Reduce manual booking confusion.
3. Give receptionists control over slot capacity and booking confirmation.
4. Allow clients to book multiple services in one visit.
5. Improve client communication through WhatsApp.
6. Organize services, packages, and bundles professionally.
7. Support flexible pricing for salon services.
8. Provide clear visibility over clients, bookings, revenue, and staff performance.
9. Support VAT and payment/deposit policies in a configurable way.
10. Prepare the salon for future multi-branch expansion.


4. Confirmed Business Decisions
The following decisions are approved for the system:
Booking engine:
Flexible booking request system using admin/receptionist-managed slots.

Booking structure:
One booking can contain multiple services, packages, bundles, or add-ons.

Booking confirmation:
Online bookings start as pending and require admin/receptionist confirmation.

Cancellation/reschedule window:
Clients can request cancellation or rescheduling up to 24 hours before the appointment.

Deposit/payment policy:
Configurable by admin.

Slot capacity:
Configurable by receptionist.

VAT:
Can be enabled or disabled by admin.

WhatsApp:
Primary communication channel for booking-related communication.

WhatsApp messages:
System includes default editable templates.

Client reviews/testimonials:
Included with admin approval before publishing.

Social login:
Supported for clients.

Phone number:
Required before submitting a booking.


5. User Roles and Actors
5.1 Guest Visitor
A guest visitor can browse public website content without logging in.
Guest permissions:
- View homepage
- View services
- View packages
- View bundles
- View offers
- View gallery
- View testimonials
- Contact salon through WhatsApp
- Start booking flow

A guest must register or login before submitting a booking request.

5.2 Client
A client is a registered website user.
Client permissions:
- Login using social login or phone/email method
- Submit booking requests
- Select multiple services in one booking
- View own bookings
- Request cancellation
- Request reschedule
- Contact salon through WhatsApp
- Submit review or feedback after completed appointment


5.3 Receptionist
The receptionist manages daily bookings and client communication.
Receptionist permissions:
- View booking calendar
- Create manual bookings
- Manage booking slots
- Configure slot capacity
- Mark slots as available, filled, blocked, or closed
- Confirm pending bookings
- Reject booking requests
- Reschedule bookings
- Cancel bookings
- Mark clients as arrived
- Mark appointments as completed
- Mark appointments as no-show
- Send WhatsApp messages using templates
- View client contact details
- Record simple payment status if allowed


5.4 Specialist / Staff Member
A specialist is a service provider such as a hairstylist, nail technician, spa therapist, makeup artist, or beautician.
Specialist permissions:
- View assigned appointments
- View own schedule
- View service details for assigned appointments
- Add internal notes if allowed
- Mark assigned service status if allowed

A staff member may exist in the system without having dashboard login access.

5.5 Branch Manager
A branch manager manages one branch.
Branch manager permissions:
- View branch dashboard
- View branch bookings
- Manage branch appointments
- Manage branch staff schedules
- View branch reports
- Monitor branch revenue
- Approve special actions if allowed
- Manage branch-level operational settings


5.6 Admin
The admin manages business configuration and operational data.
Admin permissions:
- Manage services
- Manage service variants
- Manage packages
- Manage bundles
- Manage clients
- Manage staff
- Manage payment/deposit policies
- Enable or disable VAT
- Manage WhatsApp templates
- Manage website content
- Manage gallery
- Manage testimonials
- View reports


5.7 Owner / Super Admin
The owner has full access to the system.
Owner permissions:
- Full access to all modules
- Manage users and roles
- Manage permissions
- View all reports
- View audit logs
- Manage system settings
- Manage branches
- Access financial reports
- Control sensitive business configuration


6. Role Hierarchy
The system shall support hierarchical role-based access control.
Recommended hierarchy:
Owner / Super Admin
        ↓
Admin
        ↓
Branch Manager
        ↓
Receptionist
        ↓
Specialist / Staff

Higher roles can access more features than lower roles.
Permissions must be enforced in the backend, not only hidden in the frontend.

7. Public Website Requirements
7.1 Public Website Pages
The public website shall include:
1. Homepage
2. About page
3. Services page
4. Service details page
5. Packages page
6. Bundles page
7. Offers page
8. Booking page
9. Gallery page
10. Testimonials page
11. Contact page
12. Login/Register page
13. Client profile page
14. My bookings page
15. Privacy policy page
16. Terms and cancellation policy page


7.2 Homepage Requirements
The homepage shall include:
- Premium hero section
- Book now call-to-action
- Featured services
- Featured packages
- Featured bundles
- Current offers
- Gallery preview
- Testimonials preview
- Why choose Alrouby section
- Branch/contact information
- Floating WhatsApp button
- Social media links


7.3 Service Browsing Requirements
The system shall allow clients and guests to:
- View service categories
- View services under each category
- View service description
- View service image
- View service price or price type
- View duration when available
- Ask about service through WhatsApp
- Add service to booking request


7.4 Price Display Rules
The system shall support multiple price display types:
Fixed price
Starts from price
Price range
Contact for price
Hidden price

Examples:
Classic Manicure — 300 EGP
Hair Coloring — starts from 900 EGP
Hair Treatment — 800–1,500 EGP
Bridal Package — contact us for price


8. Service Management Requirements
8.1 Service Categories
The admin shall be able to manage service categories.
Category fields:
- Category name
- Description
- Image
- Sort order
- Active/inactive status

Example categories:
- Hair
- Nails
- Makeup
- Spa
- Massage
- Skin care
- Waxing
- Bridal
- Offers
- Add-ons


8.2 Services
The admin shall be able to manage services.
Service fields:
- Service name
- Category
- Description
- Image
- Price display type
- Base price
- Duration
- Branch availability
- Staff eligibility
- Taxable status
- Active/inactive status
- Booking availability
- Preparation notes
- Aftercare notes


8.3 Service Variants
The system shall support service variants because many salon services depend on hair length, material, complexity, or specialist level.
Example:
Service: Hair Coloring

Variants:
- Short hair — 800 EGP — 90 minutes
- Medium hair — 1,200 EGP — 120 minutes
- Long hair — 1,600 EGP — 150 minutes

Service variant fields:
- Variant name
- Price
- Duration
- Description
- Active/inactive status


9. Packages and Bundles Requirements
9.1 Packages
A package is a fixed group of services sold together.
Example:
Luxury Spa Package:
- Moroccan Bath
- Massage
- Facial
- Manicure

Package fields:
- Package name
- Description
- Included services
- Original total price
- Package price
- Estimated duration
- Image
- Start date
- End date
- Branch availability
- Active/inactive status


9.2 Bundles
A bundle is a flexible offer where the client may choose from a group of eligible services.
Example:
Choose any 3 nail services for 999 EGP

Bundle fields:
- Bundle name
- Description
- Bundle type
- Eligible services
- Number of selectable services
- Bundle price
- Usage rules
- Start date
- End date
- Active/inactive status

Bundle types:
- Fixed bundle
- Flexible bundle
- Quantity bundle
- Membership-style bundle


10. Booking Engine Requirements
10.1 Booking Engine Type
The system shall use a flexible semi-manual booking request engine.
This means:
- Receptionist/admin creates booking slots.
- Slots can have configurable capacity.
- Clients submit booking requests.
- Bookings start as pending.
- Receptionist/admin confirms or adjusts the booking.
- Receptionist can manually mark slots as filled.

The system shall not require a fully automated staff-based scheduling engine in MVP.

10.2 Booking Structure
A booking represents one client visit.
One booking can contain:
- One service
- Multiple services
- Service variants
- Package
- Bundle
- Add-ons

Example:
Booking #1001

Client: Sarah Ahmed
Date: Saturday
Time: 4:00 PM

Booking items:
1. Hair Coloring — Long Hair
2. Blow Dry
3. Manicure


10.3 Booking Flow
The client booking flow shall be:
1. Client browses services/packages/bundles.
2. Client adds one or more items to booking.
3. System shows estimated total price and duration.
4. Client selects preferred date and slot.
5. Client logs in or registers.
6. Client provides phone number.
7. Client submits booking request.
8. Booking status becomes Pending.
9. Receptionist/admin reviews the booking.
10. Receptionist/admin confirms, rejects, or reschedules.
11. Client receives WhatsApp communication.


10.4 Booking Statuses
The system shall support the following booking statuses:
Pending
Confirmed
Requires Follow-up
Rescheduled
Arrived
In Progress
Completed
Cancelled
Rejected
No-show

Recommended flow:
Pending
   ↓
Confirmed
   ↓
Arrived
   ↓
In Progress
   ↓
Completed

Alternative flows:
Pending → Rejected
Pending → Requires Follow-up
Pending → Rescheduled
Confirmed → Cancelled
Confirmed → Rescheduled
Confirmed → No-show


10.5 Booking Slots
The receptionist shall be able to manage booking slots.
Slot fields:
- Branch
- Date
- Start time
- End time
- Capacity
- Booked count
- Slot status
- Online bookable status
- Notes

Slot statuses:
Available
Pending
Filled
Blocked
Closed


10.6 Slot Capacity Rules
Slot capacity shall be configurable by receptionist.
Example:
Slot: Saturday 4:00 PM
Capacity: 3
Booked count: 1
Status: Available

When capacity is reached, the system should automatically stop showing the slot as available online.
The receptionist can manually mark a slot as filled even if the booked count is lower than the capacity.

10.7 Cancellation and Rescheduling Rules
The system shall support a 24-hour cancellation/reschedule window.
Client rule:
Clients can request cancellation or rescheduling up to 24 hours before the appointment.

After the 24-hour window:
The client should be instructed to contact the salon directly through WhatsApp or phone.

Admin/receptionist rule:
Authorized dashboard users can cancel, reschedule, or adjust bookings manually.


11. WhatsApp Communication Requirements
11.1 WhatsApp Strategy
WhatsApp shall be the primary communication channel for booking-related communication.
MVP implementation:
Manual WhatsApp deep links with pre-filled messages.

Future implementation:
Automated WhatsApp Business API with approved message templates.


11.2 Public Website WhatsApp Features
The public website shall include:
- Floating WhatsApp button
- Contact via WhatsApp button
- Ask about this service on WhatsApp
- Ask about this package on WhatsApp
- Booking support via WhatsApp

Example pre-filled service inquiry:
Hello Alrouby Salon & Spa, I want to ask about {serviceName}.


11.3 Dashboard WhatsApp Features
The dashboard shall provide WhatsApp actions for:
- Booking request received
- Booking confirmation
- Reschedule request
- Cancellation message
- Appointment reminder
- Payment/deposit confirmation
- Review request

Booking details page should include:
- Send WhatsApp
- Call client
- Copy phone number

Client profile page should include:
- Open WhatsApp chat
- Send offer
- Send reminder
- Request review


11.4 Default WhatsApp Templates
The system shall include editable default templates.
Booking Request Received
Hello {clientName}, your booking request at Alrouby Salon & Spa has been received.

Date: {bookingDate}
Time: {bookingTime}
Services: {services}

Our team will review your request and contact you shortly to confirm your appointment.


Booking Confirmed
Hello {clientName}, your booking at Alrouby Salon & Spa is confirmed.

Date: {bookingDate}
Time: {bookingTime}
Services: {services}
Branch: {branchName}

For cancellation or rescheduling, please contact us at least 24 hours before your appointment.

We look forward to seeing you.


Booking Rescheduled
Hello {clientName}, your booking at Alrouby Salon & Spa has been rescheduled.

New date: {bookingDate}
New time: {bookingTime}
Services: {services}

Please confirm that this new appointment works for you.


Booking Cancelled
Hello {clientName}, your booking at Alrouby Salon & Spa has been cancelled.

Date: {bookingDate}
Time: {bookingTime}

You can contact us anytime to book a new appointment.


Appointment Reminder
Hello {clientName}, this is a friendly reminder for your appointment at Alrouby Salon & Spa.

Date: {bookingDate}
Time: {bookingTime}
Services: {services}

See you soon.


Deposit/Payment Confirmation
Hello {clientName}, we confirm receiving your payment/deposit for your booking at Alrouby Salon & Spa.

Amount: {paidAmount}
Booking date: {bookingDate}
Time: {bookingTime}

Thank you.


Review Request
Hello {clientName}, thank you for visiting Alrouby Salon & Spa.

We hope you enjoyed your experience. We would love to hear your feedback.

Please reply with your review or rating.


11.5 WhatsApp Template Variables
Templates shall support variables such as:
{clientName}
{bookingDate}
{bookingTime}
{services}
{branchName}
{salonPhone}
{salonAddress}
{totalAmount}
{paidAmount}
{remainingAmount}


12. Authentication Requirements
12.1 Client Authentication
The system shall support client login/register through:
- Google login
- Facebook login
- Phone-based login, optional
- Email/password, optional

Phone number is required before booking submission.

12.2 Social Login Rules
When a client logs in using social login, the system shall collect:
- Name
- Email, if provided by provider
- Profile image, if provided

If phone number is missing, the system shall ask the client to provide it before submitting a booking.

12.3 Dashboard Authentication
Dashboard users shall login using secure credentials.
Recommended dashboard login:
- Email and password
- Future support for two-factor authentication

Dashboard access must be controlled by roles and permissions.

13. Payments, Deposits, VAT, and Invoicing
13.1 Payment Strategy
The system shall support configurable payment/deposit policies controlled by admin.
Possible policies:
- Pay at salon only
- Optional deposit
- Required deposit
- Full online payment in future
- Manual Instapay confirmation

MVP recommendation:
Pay at salon
+ manual deposit tracking
+ future-ready online payment structure


13.2 Payment Methods
The system shall support:
- Cash
- Card
- Instapay
- Mobile wallet
- Manual bank transfer, optional
- Online payment, future


13.3 Payment Statuses
Payment status values:
Unpaid
Partially Paid
Paid
Refunded
Cancelled


13.4 VAT Requirements
VAT shall be configurable by admin.
System VAT settings:
- VAT enabled/disabled
- Default VAT rate
- Prices include VAT: yes/no
- Show VAT on invoice: yes/no
- Tax registration number

The system shall support:
- Taxable services
- Non-taxable services
- Taxable packages
- Taxable products, future

Invoice should include:
- Subtotal
- Discount
- VAT rate
- VAT amount
- Total amount
- Paid amount
- Remaining amount


13.5 Invoices
The system shall generate invoices for completed bookings or payments.
Invoice fields:
- Invoice number
- Client
- Booking
- Items
- Subtotal
- Discount
- VAT
- Total
- Payment method
- Payment status
- Created by
- Created date


14. Client Management Requirements
The system shall maintain client profiles.
Client fields:
- Full name
- Phone number
- Email
- Gender, optional
- Date of birth, optional
- Preferred branch
- Preferred specialist, optional
- Booking history
- Payment history
- Notes
- Allergies or important warnings
- Tags
- Review history
- Created date

Client tags examples:
VIP
Frequent client
Bridal client
No-show risk
Prefers WhatsApp

Sensitive client notes shall only be visible to authorized roles.

15. Staff Management Requirements
The system shall allow admin users to manage staff profiles.
Staff fields:
- Full name
- Phone
- Email
- Job title
- Branch
- Services they can perform
- Profile image
- Active/inactive status
- Dashboard login enabled/disabled

Important rule:
A staff member can exist as a service provider without having dashboard login access.


16. Branch Management Requirements
The system shall be designed to support multiple branches.
MVP may operate with one branch only.
Branch fields:
- Branch name
- Address
- Phone
- WhatsApp number
- Google Maps link
- Working hours
- Active/inactive status

System rule:
The database and architecture shall support multi-branch expansion even if only one branch is active in MVP.


17. Dashboard Requirements
17.1 Dashboard Pages
The dashboard shall include:
1. Overview
2. Calendar
3. Bookings
4. Booking slots
5. Clients
6. Services
7. Service variants
8. Categories
9. Packages
10. Bundles
11. Staff
12. Branches
13. Payments
14. Invoices
15. Offers
16. Gallery
17. Testimonials
18. WhatsApp templates
19. Reports
20. Users and roles
21. Settings
22. Audit logs


17.2 Dashboard Overview
The dashboard overview should show:
- Today’s bookings
- Pending booking requests
- Confirmed bookings
- Completed bookings
- Cancelled bookings
- No-show bookings
- Today’s revenue
- Upcoming appointments
- Quick WhatsApp reminders


17.3 Calendar Requirements
Calendar views:
- Daily view
- Weekly view
- Monthly view
- Slot view
- Staff view, future
- Branch view, future

Calendar should support:
- View bookings by status
- View slots
- Create manual booking
- Reschedule booking
- Block slot
- Mark slot as filled
- Filter by branch
- Filter by booking status


18. Offers and Discounts Requirements
The system shall allow admins to create and manage offers.
Offer types:
- Percentage discount
- Fixed amount discount
- Service discount
- Package discount
- Bundle discount
- First booking discount
- Seasonal offer
- Promo code

Offer fields:
- Offer name
- Offer code
- Discount type
- Discount value
- Eligible services
- Eligible packages
- Start date
- End date
- Usage limit
- Per-client usage limit
- Active/inactive status

Only authorized roles can apply manual discounts to bookings or invoices.

19. Gallery and Testimonials Requirements
19.1 Gallery
The system shall allow admins to manage gallery images.
Gallery fields:
- Image
- Title
- Category
- Description
- Featured status
- Display order
- Active/inactive status

Gallery categories may include:
- Hair
- Nails
- Makeup
- Spa
- Bridal
- Before and after


19.2 Client Reviews and Testimonials
MVP review flow:
1. Appointment is marked as completed.
2. Dashboard shows “Request Review”.
3. Receptionist sends WhatsApp review request.
4. Client replies manually.
5. Admin adds selected review to testimonials.
6. Testimonial appears on website after approval.

Future review flow:
1. Appointment is completed.
2. System sends automated review request.
3. Client submits rating/comment through website.
4. Admin approves or rejects review.
5. Approved review appears on website.

Review fields:
- Client name
- Rating
- Comment
- Related service, optional
- Related booking, optional
- Approval status
- Display on website
- Created date

Review statuses:
Pending
Approved
Rejected
Hidden


20. Website Content Management Requirements
Admins shall be able to manage website content without developer support.
Editable content:
- Homepage hero
- Homepage banners
- Featured services
- Featured packages
- Featured bundles
- Offers
- About section
- Gallery
- Testimonials
- Contact details
- Social media links
- Opening hours
- SEO title
- SEO description


21. Reports and Analytics Requirements
The system shall provide reports for management.
Recommended reports:
- Daily revenue
- Monthly revenue
- Revenue by service
- Revenue by package
- Revenue by staff
- Revenue by branch
- Most booked services
- Most profitable services
- Pending bookings
- Completed bookings
- Cancelled bookings
- No-show bookings
- New clients
- Returning clients
- Booking source report
- Payment method breakdown
- Discount usage report

Booking sources:
Website
Dashboard
Walk-in
Phone
WhatsApp
Instagram
Facebook


22. Audit Log Requirements
The system shall track sensitive actions.
Audit log should record:
- User who performed the action
- Action type
- Module
- Entity affected
- Old value
- New value
- Date/time
- IP address, when available

Tracked actions should include:
- Booking cancelled
- Booking rescheduled
- Booking confirmed
- Slot marked filled
- Service price changed
- Discount applied
- Payment edited
- VAT settings changed
- User role changed
- User deleted/deactivated
- Invoice edited


23. Main Data Model
23.1 User
Represents dashboard users.
id
name
email
phone
passwordHash
roleId
branchId
isActive
createdAt
updatedAt


23.2 Role
id
name
description
level
createdAt
updatedAt

Example roles:
Owner
Admin
Branch Manager
Receptionist
Specialist


23.3 Permission
id
key
module
description

Example permissions:
bookings.create
bookings.update
bookings.confirm
bookings.cancel
slots.manage
services.manage
payments.manage
vat.manage
reports.view
users.manage
roles.manage


23.4 Client
id
fullName
phone
email
gender
birthDate
preferredBranchId
notes
tags
createdAt
updatedAt


23.5 Branch
id
name
address
phone
whatsapp
mapUrl
workingHours
isActive
createdAt
updatedAt


23.6 ServiceCategory
id
name
description
image
sortOrder
isActive


23.7 Service
id
categoryId
name
description
image
priceDisplayType
basePrice
durationMinutes
isTaxable
isActive
createdAt
updatedAt


23.8 ServiceVariant
id
serviceId
name
description
price
durationMinutes
isActive
createdAt
updatedAt


23.9 Package
id
name
description
image
originalPrice
packagePrice
durationMinutes
startDate
endDate
isActive
createdAt
updatedAt


23.10 Bundle
id
name
description
bundleType
price
rules
startDate
endDate
isActive
createdAt
updatedAt


23.11 BookingSlot
id
branchId
date
startTime
endTime
capacity
bookedCount
status
isOnlineBookable
notes
createdBy
createdAt
updatedAt


23.12 Booking
id
clientId
branchId
slotId
status
source
subtotal
discountAmount
vatRate
vatAmount
totalAmount
clientNotes
adminNotes
createdBy
createdAt
updatedAt


23.13 BookingItem
id
bookingId
itemType
serviceId
serviceVariantId
packageId
bundleId
nameSnapshot
priceSnapshot
durationMinutesSnapshot
quantity
assignedStaffId
status
createdAt
updatedAt

Snapshot fields are required to preserve historical booking and invoice accuracy even if service prices change later.

23.14 Payment
id
bookingId
clientId
amount
method
status
reference
paidAt
createdBy
createdAt
updatedAt


23.15 Invoice
id
invoiceNumber
bookingId
clientId
subtotal
discountAmount
vatRate
vatAmount
totalAmount
paidAmount
remainingAmount
status
createdAt
updatedAt


23.16 WhatsAppTemplate
id
name
templateKey
content
variables
isActive
createdAt
updatedAt


23.17 Review
id
clientId
bookingId
rating
comment
status
displayOnWebsite
createdAt
updatedAt


23.18 AuditLog
id
userId
action
module
entityId
oldValue
newValue
ipAddress
createdAt


24. Functional Requirements Summary
Booking
FR-BK-001: The system shall allow clients to create one booking with multiple services.
FR-BK-002: The system shall allow booking packages and bundles.
FR-BK-003: The system shall allow receptionist-managed slots.
FR-BK-004: The system shall allow slot capacity configuration by receptionist.
FR-BK-005: The system shall allow receptionist to mark slots as filled.
FR-BK-006: The system shall create online bookings as pending.
FR-BK-007: The system shall allow admin/receptionist to confirm, reject, cancel, or reschedule bookings.
FR-BK-008: The system shall support a 24-hour cancellation/reschedule window.
FR-BK-009: The system shall store booking item price snapshots.
FR-BK-010: The system shall support future automated availability logic.


WhatsApp
FR-WA-001: The system shall support WhatsApp as the primary communication channel.
FR-WA-002: The system shall provide WhatsApp buttons on the public website.
FR-WA-003: The dashboard shall provide WhatsApp actions for bookings.
FR-WA-004: The system shall generate pre-filled WhatsApp messages.
FR-WA-005: The system shall provide editable WhatsApp templates.
FR-WA-006: The system shall support future WhatsApp Business API integration.


Authentication
FR-AUTH-001: The system shall support social login for clients.
FR-AUTH-002: The system shall require client phone number before booking.
FR-AUTH-003: The system shall support secure dashboard login.
FR-AUTH-004: The system shall enforce role-based access control.


Payments and VAT
FR-PAY-001: The system shall support configurable payment/deposit policies.
FR-PAY-002: The system shall support manual payment recording.
FR-PAY-003: The system shall support multiple payment methods.
FR-VAT-001: The system shall allow admin to enable or disable VAT.
FR-VAT-002: The system shall support VAT-inclusive and VAT-exclusive pricing.
FR-VAT-003: The system shall show VAT breakdown on invoices when enabled.


25. Non-Functional Requirements
25.1 Performance
- Website pages should load quickly.
- Booking submission should be fast and reliable.
- Dashboard calendar should handle daily salon operations smoothly.
- Reports should load within acceptable time.


25.2 Security
- Passwords must be hashed.
- Dashboard APIs must be protected.
- Role permissions must be enforced on backend.
- Sensitive data must only be visible to authorized users.
- All input must be validated.
- Sensitive actions must be logged.


25.3 Usability
- Website must be mobile-first.
- Booking flow must be simple.
- Dashboard must be easy for receptionists.
- WhatsApp actions must be quick and clear.
- Forms must include validation and helpful errors.


25.4 Scalability
The system should support future:
- Multi-branch operations
- Automated WhatsApp messaging
- Online payments
- Advanced scheduling
- Inventory management
- Loyalty programs
- Mobile app


25.5 Maintainability
- Code should be modular.
- APIs should be documented.
- Database schema should be clear.
- Business rules should be configurable where possible.
- System should be easy to extend.


26. Security Requirements
The system shall include:
- Secure authentication
- Role-based authorization
- Password hashing
- Input validation
- API protection
- Rate limiting for sensitive endpoints
- Audit logs
- Secure file upload handling
- Protection against unauthorized data access

Dashboard users should only access data allowed by their role and branch.

27. Recommended MVP Scope
The MVP should include:
1. Public website
2. Services listing
3. Service variants
4. Packages
5. Bundles
6. Flexible booking request flow
7. One booking with multiple services
8. Admin/receptionist-managed slots
9. Slot capacity configuration
10. Pending booking confirmation
11. WhatsApp deep links and templates
12. Client social login
13. Phone number required before booking
14. Dashboard login
15. Hierarchical roles
16. Client management
17. Staff management
18. Basic payment/deposit tracking
19. Configurable VAT
20. Gallery
21. Testimonials
22. Basic reports
23. Audit logs


28. Future Enhancements
Future phases may include:
- Automated WhatsApp Business API
- Online payments
- Automatic appointment reminders
- Advanced staff availability engine
- Staff-specific booking
- Room/resource scheduling
- Inventory management
- Product sales
- Loyalty program
- Memberships
- Gift cards
- Referral system
- Mobile app
- Advanced marketing automation
- Google Calendar integration
- Google reviews integration
- Meta Pixel / TikTok Pixel advanced tracking


29. Recommended Technology Stack
Frontend
Next.js
TypeScript
Tailwind CSS
shadcn/ui
React Hook Form
Zod


Backend
NestJS
TypeScript
REST API
Prisma ORM
PostgreSQL
JWT authentication
Role-based access control


Database
PostgreSQL


Background Jobs
Redis
BullMQ

Useful for future:
- WhatsApp automation
- Appointment reminders
- Review requests
- Report generation


File Storage
Cloudinary or S3-compatible storage

Used for:
- Service images
- Gallery images
- Staff images
- Homepage banners


Hosting
Suggested options:
Frontend: Vercel
Backend: Railway / Render / VPS / DigitalOcean
Database: Neon / Supabase / Railway PostgreSQL


30. Acceptance Criteria
The MVP shall be accepted when:
1. Clients can browse services, packages, and bundles.
2. Clients can submit a booking request with multiple services.
3. Clients can login/register using supported authentication.
4. Phone number is required before booking submission.
5. Booking requests appear in the dashboard as pending.
6. Receptionist can confirm, reject, cancel, or reschedule bookings.
7. Receptionist can create and manage booking slots.
8. Receptionist can configure slot capacity.
9. Receptionist can mark slots as filled.
10. WhatsApp buttons generate correct pre-filled messages.
11. Admin can manage services, variants, packages, and bundles.
12. Admin can enable/disable VAT.
13. Admin can configure payment/deposit policy.
14. Dashboard roles restrict access correctly.
15. Client records and booking history are stored.
16. Basic reports are available.
17. Audit logs are recorded for sensitive actions.
18. Gallery and testimonials can be managed.
19. Website works correctly on mobile and desktop.
20. System is ready for future multi-branch and WhatsApp API expansion.


31. Final Approved System Concept
The approved concept for Alrouby Salon & Spa is:
A premium salon and spa digital platform with a public website, flexible booking request engine, multi-service bookings, receptionist-managed slots, WhatsApp-first communication, social login, configurable VAT and payment policies, hierarchical dashboard roles, content management, reports, audit logs, and future-ready architecture for automation, online payments, inventory, loyalty, and multi-branch growth.



