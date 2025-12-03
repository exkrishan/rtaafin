# 🎨 Frontend UI Elements - Complete List

## 📋 Overview
This document lists all logos, names, branding, and disposition codes used in the frontend demo page (`http://localhost:3000/demo`).

---

## 🖼️ **LOGOS**

### 1. **Exotel Logo**
- **Location:** Left Sidebar (top)
- **File:** Inline SVG in `components/LeftSidebar.tsx`
- **Size:** 99x30px (scaled to max-width: 120px)
- **Color:** Black (#000000) with blue accent (#394FB6)
- **Usage:** Main branding logo in navigation sidebar

### 2. **XTRM Logo** (Alternative)
- **Location:** `public/xtrm_logo_color.svg`
- **File:** SVG file (115x20px)
- **Color:** Blue (#394FB6)
- **Status:** Available but not currently used in demo page

---

## 👤 **NAMES & BRANDING**

### Customer Information
- **Customer Name:** `Manish Sharma`
- **Customer ID:** `cust-789`
- **Masked Phone:** `+91-XXXX-1234`
- **Business Number:** `+91-XXXX-1234`
- **Home Number:** `+91-XXXX-1234`
- **Email:** `manish.sharma@example.com`
- **Instagram:** `@mj12 @mani12`
- **Account:** `MoneyAssure — Card Services`
- **Tags:** `Premium`, `Card`

### Agent Information
- **Agent Name:** `Priya`
- **Agent ID:** `agent-demo-123`
- **Department:** `Card Services team`
- **Company:** `MoneyAssure Bank`

### Case/Interaction IDs
- **Case IDs:**
  - `CASE-1234` (Payment issue resolved - 2025-10-29)
  - `CASE-5678` (KYC updated - 2025-09-12)
  - `CASE-9012` (Plan upgrade - 2025-07-21)

### Company/Brand Names
- **Primary:** `MoneyAssure Bank`
- **Service:** `MoneyAssure — Card Services`
- **Card Type:** `Platinum Credit Card`
- **Card Ending:** `7792`

### Demo Transcript Context
- **Bank Name:** `MoneyAssure Bank`
- **Service Team:** `Card Services team`
- **Card Type:** `Platinum Credit Card`
- **Tracking Number:** `IN123456789`
- **Shipping:** `India Post`
- **Delivery Date:** `November 15, 2025`

---

## 🏷️ **DISPOSITION CODES**

### Parent Disposition Codes (from Taxonomy)

Based on the codebase and test documentation, the system uses hierarchical dispositions:

#### 1. **SALE_COMPLETED**
- **ID:** `1`
- **Title:** `Sale Completed`
- **Category:** `sales`
- **Sub-Dispositions:**
  - `follow_up` (ID: 21) - "Follow-up on Order"
  - Additional sub-dispositions (4 more)

#### 2. **CREDIT_CARD_FRAUD**
- **ID:** `3`
- **Title:** `Credit Card Fraud`
- **Category:** `fraud` or `security`
- **Sub-Dispositions:**
  - `fraud` (ID: 25) - "Fraud"
  - Additional sub-dispositions

#### 3. **GENERAL_INQUIRY**
- **Code:** `GENERAL_INQUIRY`
- **Title:** `General Inquiry`
- **Category:** `general`
- **Usage:** Fallback disposition when no match found
- **Sub-Dispositions:** Varies

#### 4. **OTHER**
- **Code:** `OTHER`
- **Title:** `Other`
- **Category:** `general`
- **Usage:** Fallback disposition
- **Sub-Dispositions:** Varies

### Additional Disposition Codes (Referenced in Code)

#### Intent-Based Dispositions
- `credit_card_fraud` - Credit Card Fraud
- `credit_card_block` - Credit Card Block
- `credit_card_replacement` - Credit Card Replacement
- `debit_card_fraud` - Debit Card Fraud
- `debit_card_block` - Debit Card Block
- `account_balance` - Account Balance Inquiry
- `fraud` - General Fraud
- `card_replacement` - Card Replacement

### Disposition Status/Tags
- **Neutral** - Yellow tag (e.g., "Intent: Card Replacement Request")
- **Closed** - Green tag (e.g., "Case: CASE-1234 | Delivery | Closed")
- **Open** - Status for active cases
- **In Progress** - Status for ongoing cases

### Disposition Categories
- `sales` - Sales-related dispositions
- `fraud` - Fraud-related dispositions
- `security` - Security-related dispositions
- `general` - General inquiries
- `delivery` - Delivery-related dispositions
- `payment` - Payment-related dispositions

---

## 📝 **INTENT CODES**

### Intent Detection Codes (from API)
- `credit_card` - Credit card related
- `credit_card_fraud` - Credit card fraud
- `credit_card_block` - Credit card block
- `credit_card_replacement` - Credit card replacement
- `debit_card` - Debit card related
- `debit_card_fraud` - Debit card fraud
- `debit_card_block` - Debit card block
- `account` - Account related
- `fraud` - General fraud
- `transaction` - Transaction related
- `payment` - Payment related
- `billing` - Billing related
- `charge` - Charge related
- `dispute` - Dispute related
- `refund` - Refund related
- `sim` - SIM card related

---

## 🎯 **PAST INTERACTION INTENTS**

### Sample Past Interactions (from Demo)
1. **Intent:** `Card Replacement Request`
   - **Status:** `Neutral`
   - **Description:** "Manish had reported a fraudulent SMS and a small unauthorized debit card transaction in the past few months, leading to a new debit card issuance."

2. **Case:** `CASE-1234 | Delivery | Closed`
   - **Status:** `Closed` (Green)
   - **Summary:** "Payment issue resolved"
   - **Date:** `2025-10-29`

3. **Case:** `CASE-5678`
   - **Summary:** "KYC updated"
   - **Date:** `2025-09-12`

4. **Case:** `CASE-9012`
   - **Summary:** "Plan upgrade"
   - **Date:** `2025-07-21`

---

## 🎨 **UI ELEMENTS & LABELS**

### Navigation Icons (Left Sidebar)
- Home icon
- Calls/Interactions icon (with badge: `63`)
- Tasks/Checkbox icon
- Calendar icon
- Users/Team icon
- App launcher icons (4 grid icons)
- Settings icon
- Help icon

### Call Control Buttons
- Mute/Unmute
- Hold
- Transfer
- Conference
- Keypad
- Record
- Complete
- End Call

### Customer Information Labels
- **Phone Number:** `+91-XXXX-1234`
- **Business Number:** `+91-XXXX-1234`
- **Home Number:** `+91-XXXX-1234`
- **Email ID:** `manish.sharma@example.com`
- **Instagram:** `@mj12 @mani12`

### Section Headers
- **Customer Information**
- **Summary**
- **Past Interactions (4)**
- **Agent Copilot**
- **Knowledge Base Suggestions**
- **Transcripts**

### Buttons & Actions
- **Last 5 Interaction** (button)
- **Search interactions...** (button)
- **Q Search KB...** (search bar)

---

## 📊 **STATUS INDICATORS**

### Call Status
- **Active:** Green dot with call duration
- **Paused:** Pause icon
- **Ended:** Call ended state
- **Waiting:** "Waiting for transcript..."

### Agent Copilot Status
- **Active:** Green dot indicator
- **Inactive:** No indicator

### Disposition Status
- **Neutral:** Yellow tag
- **Closed:** Green tag
- **Open:** Default state

---

## 🔗 **EXTERNAL LINKS**

### CRM Links (Mock)
- **Customer CRM:** `https://crm.example.com/customer/cust-789`
- **Case History:** `https://crm.example.com/cases/cust-789`

### KB Article Links (Mock)
- **Card Replacement:** `https://kb.example.com/card-replacement`
- **Fraud Dispute:** `https://example.com/kb/fraud-dispute`
- **Card Blocking:** `https://example.com/kb/card-blocking`

---

## 📌 **NOTES**

1. **Disposition Taxonomy:** The system uses a hierarchical disposition structure with:
   - Parent dispositions (with IDs)
   - Sub-dispositions (with IDs)
   - Categories for grouping

2. **Fallback Dispositions:** When no match is found, the system falls back to:
   - `GENERAL_INQUIRY` (primary fallback)
   - `OTHER` (secondary fallback)

3. **Intent Mapping:** Intents detected from transcripts are mapped to disposition codes using:
   - Code matching
   - Title matching
   - Tag matching
   - Fallback matching

4. **Mock Data:** The demo page uses mock customer data (`Manish Sharma`) and sample interactions for demonstration purposes.

---

## 🔄 **UPDATES NEEDED**

If you need to update any of these elements:

1. **Logos:** Update SVG files in `public/` or inline SVGs in components
2. **Names:** Update mock data in `app/demo/page.tsx` (lines 30-42)
3. **Disposition Codes:** Update database `disposition_taxonomy` view or `dispositions_master` table
4. **Intent Codes:** Update intent mapping in `app/api/calls/ingest-transcript/route.ts`

---

**Last Updated:** Based on codebase analysis as of current date

