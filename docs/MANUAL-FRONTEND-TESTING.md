# CDP Manual Frontend Testing Suite

> Step-by-step manual testing guide for the CDP frontend at `cdpv2.ssd.uz`.
> UI language: **Russian**. This guide provides both Russian labels and English translations.

## Table of Contents

- [Prerequisites & Test Accounts](#prerequisites--test-accounts)
- [UI Glossary (Russian → English)](#ui-glossary)
- [MFE-1: Authentication](#mfe-1-authentication)
- [MFE-2: Dashboard](#mfe-2-dashboard)
- [MFE-3: Clients (Customers)](#mfe-3-clients-customers)
- [MFE-4: Events](#mfe-4-events)
- [MFE-5: Aggregates (UDAFs)](#mfe-5-aggregates-udafs)
- [MFE-6: Segmentation](#mfe-6-segmentation)
- [MFE-7: Campaigns](#mfe-7-campaigns)
- [MFE-8: Communications](#mfe-8-communications)
- [MFE-9: Scenarios](#mfe-9-scenarios)
- [MFE-10: Field Statistics](#mfe-10-field-statistics)
- [MFE-11: Files](#mfe-11-files)
- [Data Preparation Guide](#data-preparation-guide)

---

## Prerequisites & Test Accounts

### Test Environment

| Item | Value |
|------|-------|
| URL | `https://cdpv2.ssd.uz` |
| Domain | `1762934640.cdp.com` |
| Email | `shop2025.11.12-13:04:00@cdp.ru` |
| Password | `qwerty123` |
| Browser | Chrome or Chromium (latest) |
| Language | Russian (the UI is entirely in Russian) |

### Before You Start

1. Open Chrome/Chromium
2. Navigate to `https://cdpv2.ssd.uz`
3. You should see the login page at `/auth/sign-in`
4. Keep this guide open in a second tab/window

---

## UI Glossary

### Navigation & Sections

| Russian | English | Where |
|---------|---------|-------|
| Панель управления | Dashboard | Sidebar top |
| Данные | Data | Sidebar section |
| Клиенты | Clients | Sidebar → Data |
| События | Events | Sidebar → Data |
| Сценарий / Сценарии | Scenario / Scenarios | Sidebar → Data |
| Файлы | Files | Sidebar → Data |
| Маркетинг | Marketing | Sidebar section |
| Агрегаты | Aggregates | Sidebar → Marketing |
| Сегментация / Сегменты | Segmentation / Segments | Sidebar → Marketing |
| Рассылки | Campaigns | Sidebar → Marketing |
| Коммуникации | Communications | Sidebar → Marketing |
| Аналитика | Analytics | Sidebar section |
| Статистика полей | Field Statistics | Sidebar → Analytics |

### Common Buttons & Controls

| Russian | English |
|---------|---------|
| Войти | Sign In |
| Зарегистрироваться | Register |
| Добавить | Add |
| Сохранить | Save |
| Удалить | Delete |
| Отмена | Cancel |
| Фильтры | Filters |
| Добавить столбцы | Add Columns |
| Сбросить фильтры | Reset Filters |
| Выберите поле | Select Field |
| Всего: | Total: |

### Dashboard Tabs

| Russian | English |
|---------|---------|
| Артефакты арендатора | Tenant Artifacts |
| Поля схемы клиента | Client Schema Fields |
| Поля схемы событий | Event Schema Fields |
| Конкретные сопоставления полей | Concrete Field Mappings |
| Создать шаблон | Create Template |

### Form Fields

| Russian | English |
|---------|---------|
| Домен | Domain |
| Электронная почта | Email |
| Пароль | Password |
| Название | Name |
| Создано | Created |
| Статус | Status |

---

## MFE-1: Authentication

### MFE-1.1: Login Page Layout

**Goal:** Verify the login page displays correctly with all required elements.

**Steps:**
1. Open `https://cdpv2.ssd.uz` in your browser
2. You should be redirected to `/auth/sign-in`

**What to check:**
- [ ] Page loads without errors
- [ ] Three input fields are visible:
  - **"Домен"** (Domain) — text input
  - **"Электронная почта"** (Email) — text input
  - **"Пароль"** (Password) — password input (characters hidden)
- [ ] Blue/primary button labeled **"Войти"** (Sign In) is visible
- [ ] Link **"Зарегистрироваться"** (Register) is visible, pointing to `/auth/sign-up`
- [ ] No console errors (open DevTools → Console tab)

---

### MFE-1.2: Successful Login

**Goal:** Verify a user can log in with valid credentials and reach the dashboard.

**Steps:**
1. On the login page (`/auth/sign-in`)
2. Click the **"Домен"** field → type: `1762934640.cdp.com`
3. Click the **"Электронная почта"** field → type: `shop2025.11.12-13:04:00@cdp.ru`
4. Click the **"Пароль"** field → type: `qwerty123`
5. Click the **"Войти"** button

**What to check:**
- [ ] Page redirects to `/dashboard`
- [ ] Dashboard page loads with content (no blank screen)
- [ ] Sidebar navigation appears on the left
- [ ] No error messages shown

---

### MFE-1.3: Login with Wrong Password

**Goal:** Verify error handling when password is incorrect.

**Steps:**
1. On the login page
2. Enter the correct domain: `1762934640.cdp.com`
3. Enter the correct email: `shop2025.11.12-13:04:00@cdp.ru`
4. Enter wrong password: `wrongpassword123`
5. Click **"Войти"**

**What to check:**
- [ ] User stays on `/auth/sign-in` (no redirect)
- [ ] An error message appears (toast, banner, or inline text)
- [ ] Password field is cleared or highlighted
- [ ] No unhandled errors in console

---

### MFE-1.4: Unauthenticated Access Redirect

**Goal:** Verify that protected pages redirect to login.

**Steps:**
1. Open a new incognito/private browser window
2. Navigate directly to `https://cdpv2.ssd.uz/dashboard`

**What to check:**
- [ ] Browser redirects to `/auth/sign-in`
- [ ] No dashboard content flashes before redirect

---

### MFE-1.5: Registration Page

**Goal:** Verify the registration page exists and is accessible.

**Steps:**
1. On the login page, click the **"Зарегистрироваться"** link

**What to check:**
- [ ] Browser navigates to `/auth/sign-up`
- [ ] Registration form is visible with required fields
- [ ] A link back to sign-in exists

---

## MFE-2: Dashboard

### MFE-2.1: Dashboard Overview

**Goal:** Verify the dashboard displays tenant info and key metrics after login.

**Precondition:** Logged in successfully (see MFE-1.2).

**Steps:**
1. After login, you should be on `/dashboard`
2. Look at the main content area

**What to check:**
- [ ] Page title shows **"Панель управления"** (Dashboard)
- [ ] Five tabs are visible across the top:
  1. **"Артефакты арендатора"** (Tenant Artifacts) — should be selected by default
  2. **"Поля схемы клиента"** (Client Schema Fields)
  3. **"Поля схемы событий"** (Event Schema Fields)
  4. **"Конкретные сопоставления полей"** (Concrete Field Mappings)
  5. **"Создать шаблон"** (Create Template)

---

### MFE-2.2: Tenant Artifacts Tab

**Goal:** Verify tenant infrastructure info is displayed.

**Steps:**
1. On the dashboard, ensure **"Артефакты арендатора"** tab is active (it's the default)
2. Review the content

**What to check:**
- [ ] **"База данных"** (Database) section visible with `isReady: "true"`
- [ ] **"Загрузка клиентов"** (Client Loading) section visible
- [ ] **"Загрузка событий"** (Event Loading) section visible
- [ ] **"Топик клиентов"** (Client Topic) section visible
- [ ] **"Топик событий"** (Event Topic) section visible
- [ ] No error states or loading spinners stuck indefinitely

---

### MFE-2.3: Client Schema Fields Tab

**Steps:**
1. Click the **"Поля схемы клиента"** tab

**What to check:**
- [ ] Table or list of customer fields appears
- [ ] Each field shows: name, type (VARCHAR/BOOL/DOUBLE/BIGINT/DATE), internal column name
- [ ] Fields include system fields (primary_id) and custom fields (gender, age, etc.)

---

### MFE-2.4: Event Schema Fields Tab

**Steps:**
1. Click the **"Поля схемы событий"** tab

**What to check:**
- [ ] Event types listed (at minimum "purchase")
- [ ] Each event type's fields visible with types and internal names

---

### MFE-2.5: Sidebar Counts

**Goal:** Verify the sidebar shows data counts next to menu items.

**Steps:**
1. Look at the left sidebar

**What to check:**
- [ ] **"Клиенты"** shows a number next to it (total customer count)
- [ ] **"События"** shows a number next to it (total event count)
- [ ] Numbers are non-zero if data has been ingested

---

## MFE-3: Clients (Customers)

### MFE-3.1: Clients Page Layout

**Goal:** Verify the customers list page displays correctly.

**Steps:**
1. In the sidebar, under **"Данные"** section, click **"Клиенты"**
2. Wait for the page to load

**What to check:**
- [ ] URL is `/data/clients`
- [ ] Page heading shows **"Клиенты"**
- [ ] A data table is visible with rows of customer data
- [ ] Table has column headers (field names)
- [ ] **"Всего:"** (Total) shows the customer count at the bottom or top
- [ ] Three control buttons visible:
  - **"Фильтры"** (Filters)
  - **"Добавить столбцы"** (Add Columns)
  - **"Сбросить фильтры"** (Reset Filters)

---

### MFE-3.2: Client Table Pagination

**Goal:** Verify pagination works correctly.

**Steps:**
1. On the Clients page (`/data/clients`)
2. Look at the bottom of the table for pagination controls
3. If there are more rows than fit on one page, click "Next" or page 2

**What to check:**
- [ ] Pagination controls are visible (page numbers or next/prev buttons)
- [ ] Clicking next page loads new rows
- [ ] **"Всего:"** count remains the same across pages
- [ ] No duplicate rows between pages

---

### MFE-3.3: Add/Remove Columns

**Goal:** Verify column visibility can be customized.

**Steps:**
1. On the Clients page, click **"Добавить столбцы"** (Add Columns)
2. A panel or dropdown should appear listing available columns
3. Toggle a column off (uncheck it)
4. Close the column picker

**What to check:**
- [ ] Column picker opens with list of all customer fields
- [ ] Toggling a column hides/shows it in the table
- [ ] Table re-renders correctly after column change
- [ ] At least primary_id column is always visible (or has minimum required columns)

---

### MFE-3.4: Filters

**Goal:** Verify customer data can be filtered.

**Steps:**
1. On the Clients page, click **"Фильтры"** (Filters)
2. A filter panel should appear
3. Select a field to filter by (e.g., gender)
4. Set filter condition (e.g., equals "female")
5. Apply the filter

**What to check:**
- [ ] Filter panel opens with field selection
- [ ] Available operators match the field type (= for VARCHAR, >, < for numbers, etc.)
- [ ] After applying: table shows only matching rows
- [ ] **"Всего:"** count updates to reflect filtered count
- [ ] **"Сбросить фильтры"** (Reset Filters) clears all filters and restores full list

---

### MFE-3.5: Client Detail View

**Goal:** Verify clicking a customer row opens their profile.

**Steps:**
1. On the Clients page, click any row in the table
2. A detail view should open (either a new page or a side panel)

**What to check:**
- [ ] Customer profile loads with all field values
- [ ] Primary ID is displayed
- [ ] All custom fields show their values (name, gender, age, etc.)
- [ ] Back button or breadcrumb returns to the clients list

---

## MFE-4: Events

### MFE-4.1: Events Navigation

**Goal:** Verify event type navigation from the sidebar.

**Steps:**
1. In the sidebar, under **"Данные"**, find **"События"** (Events)
2. Click on it — it should expand to show event types
3. Look for **"purchase"** with a count number (e.g., "purchase 100")
4. Click on **"purchase"**

**What to check:**
- [ ] **"События"** expands to show a dropdown/submenu of event types
- [ ] At least **"purchase"** event type is listed
- [ ] Each event type shows a count next to its name
- [ ] Clicking "purchase" navigates to the events page for that type

---

### MFE-4.2: Events Table

**Goal:** Verify the events list page shows data correctly.

**Steps:**
1. Navigate to the purchase events page (click "purchase" in sidebar)

**What to check:**
- [ ] URL pattern: `/data/events/{eventTypeId}?title=purchase`
- [ ] Data table is visible with event rows
- [ ] Table has column headers matching event fields
- [ ] **"Фильтры"** (Filters) button visible
- [ ] **"Добавить столбцы"** (Add Columns) button visible
- [ ] **"Всего:"** shows total event count
- [ ] Pagination controls work if many events

---

### MFE-4.3: Event Filters

**Goal:** Verify event data can be filtered.

**Steps:**
1. On the events page, click **"Фильтры"**
2. Select a field (e.g., delivery_city)
3. Set filter (e.g., equals "Tashkent")
4. Apply

**What to check:**
- [ ] Filter panel shows event fields
- [ ] After applying: only events matching filter appear
- [ ] Count updates
- [ ] Reset filters restores full list

---

## MFE-5: Aggregates (UDAFs)

### MFE-5.1: Aggregates Page Layout

**Goal:** Verify the aggregates list page.

**Steps:**
1. In the sidebar, under **"Маркетинг"**, click **"Агрегаты"** (Aggregates)

**What to check:**
- [ ] URL is `/marketing/aggregate`
- [ ] Page heading shows **"Агрегаты"**
- [ ] **"Добавить"** (Add) button is visible
- [ ] If aggregates exist, they are listed (table or card layout)

---

### MFE-5.2: Create Aggregate (UDAF)

**Goal:** Verify creating a new aggregate through the UI.

**Precondition:** At least one event type with numeric fields must exist (e.g., "purchase" with "total_price").

**Steps:**
1. On the Aggregates page, click **"Добавить"** (Add)
2. A form or modal should appear
3. Fill in:
   - **Name:** `TEST_manual_sum_price`
   - **Event type:** select "purchase"
   - **Field:** select "total_price" (or its display name)
   - **Aggregation type:** select "SUM"
   - **Time window:** select "All time" (or leave default)
4. Click **"Сохранить"** (Save) or the submit button

**What to check:**
- [ ] Form opens with all required fields
- [ ] Event type dropdown lists available event types
- [ ] Field dropdown updates based on selected event type
- [ ] Aggregation type dropdown has: SUM, COUNT, AVG, MIN, MAX
- [ ] After saving: new aggregate appears in the list
- [ ] No error messages

---

### MFE-5.3: View Aggregate Details

**Steps:**
1. On the Aggregates page, click on an existing aggregate

**What to check:**
- [ ] Detail view shows: name, event type, field, aggregation type, time window
- [ ] Values are correct and match what was configured

---

## MFE-6: Segmentation

> **IMPORTANT:** Segmentation is one of the core features. Test thoroughly with different predicate combinations.

### MFE-6.1: Segmentation Page Layout

**Steps:**
1. In the sidebar, under **"Маркетинг"**, click **"Сегменты"** (Segments)

**What to check:**
- [ ] URL is `/marketing/segments`
- [ ] Page heading shows **"Сегментация"**
- [ ] **"Добавить"** (Add) button visible
- [ ] **"Всего:"** shows segment count
- [ ] Existing segments listed (if any)

---

### MFE-6.2: Create Simple Segment — Gender Filter

**Goal:** Create a segment that filters female customers and verify the preview count.

**Precondition:** Customer data ingested with gender field populated.

**Steps:**
1. Click **"Добавить"** (Add) on the Segmentation page
2. A segment creation form/modal should open
3. Enter segment name: `TEST_manual_females`
4. In the predicate builder:
   - Select field: **gender** (or its display name)
   - Select operator: **= (equals)**
   - Enter value: **female**
5. Click **Preview** (or equivalent button to see count)
6. Save the segment

**What to check:**
- [ ] Predicate builder UI loads with field dropdown
- [ ] Field dropdown lists all customer fields
- [ ] Operator dropdown changes based on field type
- [ ] Preview shows count = **4** (Alice, Carol, Eve, Grace — our test data has 4 females)
- [ ] Segment saves successfully and appears in the list

---

### MFE-6.3: Create Segment — Age Filter (Numeric)

**Goal:** Create a segment filtering by numeric field.

**Steps:**
1. Click **"Добавить"**
2. Name: `TEST_manual_adults`
3. Predicate:
   - Field: **is_adult** (boolean)
   - Operator: **= (equals)**
   - Value: **true**
4. Preview

**What to check:**
- [ ] Preview count = **8** (all adults in test data)
- [ ] Boolean field shows appropriate operator options

**Alternative test with numeric operator:**
1. Name: `TEST_manual_high_income`
2. Predicate:
   - Field: **income**
   - Operator: **> (greater than)**
   - Value: **100000**
3. Preview → expect count = **3** (Bob $120K, Dave $250K, Frank $180K)

---

### MFE-6.4: Create Segment — Compound Predicate (AND)

**Goal:** Test combining multiple conditions with AND logic.

**Steps:**
1. Click **"Добавить"**
2. Name: `TEST_manual_adult_females`
3. First condition:
   - Field: **gender**
   - Operator: **=**
   - Value: **female**
4. Add another condition (look for a "+" or "Add condition" button)
5. Ensure combinator is set to **AND**
6. Second condition:
   - Field: **is_adult**
   - Operator: **=**
   - Value: **true**
7. Preview

**What to check:**
- [ ] UI allows adding multiple conditions
- [ ] AND/OR combinator toggle or dropdown exists
- [ ] Preview count = **3** (Alice 35, Eve 25, Grace 31 — adult females; Carol is 17 = minor)
- [ ] Both conditions visible in the predicate builder

---

### MFE-6.5: Create Segment — Compound Predicate (OR)

**Goal:** Test OR logic.

**Steps:**
1. Name: `TEST_manual_female_or_subscribed`
2. First condition: gender = "female"
3. Change combinator to **OR**
4. Second condition: is_subscribed = true
5. Preview

**What to check:**
- [ ] OR combinator selectable
- [ ] Preview count = **7** (4 females + 6 subscribed, minus 3 overlap = 7 unique)
  - Females: Alice, Carol, Eve, Grace
  - Subscribed: Alice, Carol, Grace, Dave, Hana, Ivan
  - Union: Alice, Carol, Eve, Grace, Dave, Hana, Ivan = 7

---

### MFE-6.6: Edit Existing Segment

**Steps:**
1. On the Segmentation page, click on an existing segment to open it
2. Modify the predicate (change a value or add a condition)
3. Preview → verify count changed
4. Save

**What to check:**
- [ ] Existing predicate loads correctly in the editor
- [ ] Modifications can be made
- [ ] Preview reflects the updated predicate
- [ ] Save persists changes

---

### MFE-6.7: Delete Segment

**Steps:**
1. On a segment, find the delete button (trash icon or "Удалить")
2. Click delete
3. Confirm if prompted

**What to check:**
- [ ] Confirmation dialog appears before deletion
- [ ] After confirming: segment removed from list
- [ ] *(Known BUG-009: DELETE may return 400 via API — check if UI handles this gracefully)*

---

## MFE-7: Campaigns

### MFE-7.1: Campaigns Page Layout

**Steps:**
1. In the sidebar, under **"Маркетинг"**, click **"Рассылки"** (Campaigns)

**What to check:**
- [ ] URL is `/marketing/campaigns`
- [ ] Page heading shows **"Рассылки"**
- [ ] **"Добавить"** (Add) button visible
- [ ] Existing campaigns listed (if any)

---

### MFE-7.2: Create Campaign

**Precondition:** You need all three prerequisites:
1. A **verified communication channel** (see MFE-8.2)
2. A **template** (see Dashboard → "Создать шаблон" tab, or API)
3. A **segmentation** (see MFE-6.2)

**Steps:**
1. Click **"Добавить"** (Add)
2. Fill in the campaign form:
   - **Name:** `TEST_manual_campaign`
   - **Segment:** select an existing segmentation
   - **Channel:** select a verified communication channel
   - **Template:** select an existing template
3. Save the campaign

**What to check:**
- [ ] Form lists available segments, channels, and templates in dropdowns
- [ ] Only verified channels appear (or unverified ones are marked/disabled)
- [ ] Campaign saves and appears in the list
- [ ] Campaign detail shows all linked entities

---

### MFE-7.3: Preview Campaign Reach

**Steps:**
1. Open a campaign (click on it in the list)
2. Look for a "Preview" or "Compute" button
3. Click it

**What to check:**
- [ ] Preview shows customer count matching the linked segment's count
- [ ] No errors during computation

---

## MFE-8: Communications

### MFE-8.1: Communications Page Layout

**Steps:**
1. In the sidebar, under **"Маркетинг"**, click **"Коммуникации"** (Communications)

**What to check:**
- [ ] URL is `/marketing/communication`
- [ ] Page heading shows **"Коммуникации"**
- [ ] **"Добавить"** (Add) button visible
- [ ] Existing channels listed with their verification status

---

### MFE-8.2: Create Communication Channel

**Steps:**
1. Click **"Добавить"** (Add)
2. Fill in channel form:
   - **Name:** `TEST_manual_channel`
   - **Type:** Email (or Webhook)
   - **Config:** fill in required fields (host, port, etc.)
3. Save

**What to check:**
- [ ] Form has channel type selection
- [ ] Config fields change based on channel type
- [ ] Channel appears in list after save
- [ ] Status shows as unverified initially

---

### MFE-8.3: Verify Channel

**Steps:**
1. On an unverified channel, find the verify button
2. Click verify

**What to check:**
- [ ] Verification process runs (may show loading)
- [ ] Status updates to verified (or shows error if config is invalid)

---

## MFE-9: Scenarios

### MFE-9.1: Scenarios Page Layout

**Steps:**
1. In the sidebar, under **"Данные"**, click **"Сценарий"** (Scenarios)

**What to check:**
- [ ] URL is `/data/scenario`
- [ ] Page heading shows **"Сценарии"** (Scenarios)
- [ ] **"Добавить"** (Add) button visible
- [ ] Table with columns: **"Название"** (Name), **"Создано"** (Created), **"Статус"** (Status)
- [ ] Existing scenarios listed with status **"Новый"** (New) or other statuses

---

### MFE-9.2: Create Scenario

**Steps:**
1. Click **"Добавить"** (Add)
2. Enter scenario name: `TEST_manual_scenario`
3. Save or confirm creation

**What to check:**
- [ ] Name field accepts input
- [ ] New scenario appears in the list
- [ ] Status shows **"Новый"** (New)
- [ ] Created date is today's date

---

### MFE-9.3: Open Scenario Builder

**Goal:** Verify the visual scenario builder opens and is functional.

**Steps:**
1. Click on an existing scenario in the list
2. The scenario builder (canvas/visual editor) should open

**What to check:**
- [ ] A visual canvas/editor loads (drag-and-drop style)
- [ ] Ability to add nodes (look for node type buttons or a node palette)
- [ ] Canvas is interactive (can pan, zoom)

---

### MFE-9.4: Build a Simple Scenario Flow

**Goal:** Create a minimal trigger → wait → action flow.

**Steps:**
1. Open a scenario in the builder
2. Add a **Trigger** node:
   - Find the trigger node type in the palette
   - Select trigger type: "trigger_now" (or equivalent UI option)
3. Add a **Wait** node:
   - Select wait type: "static_wait"
   - Set duration: 60 minutes
4. Add an **Action** node:
   - Select action type: "email"
   - Link to a communication channel and template
5. Connect the nodes with edges:
   - Drag from trigger → wait
   - Drag from wait → action
6. Save the scenario

**What to check:**
- [ ] Each node type can be added to the canvas
- [ ] Nodes display their type and configuration
- [ ] Edges visually connect nodes with arrows/lines
- [ ] *(Known BUG-017: Save may return 500 — check if UI shows error gracefully)*

---

### MFE-9.5: Branch Node in Scenario

**Goal:** Test the branch (decision) node with yes/no paths.

**Steps:**
1. In the scenario builder, add a **Branch** node
2. Configure the branch with a predicate (e.g., gender = "female")
3. Add two nodes after the branch (one for yes, one for no)
4. Connect:
   - Branch → Yes path → first action node
   - Branch → No path → second action node

**What to check:**
- [ ] Branch node shows predicate configuration
- [ ] Yes/No output connections are distinguishable (different colors, labels, or ports)
- [ ] Both paths can connect to different downstream nodes

---

### MFE-9.6: Scenario Validation Issues

**Known bugs to check:**

- [ ] Try creating a scenario with name = `   ` (spaces only) → *(BUG-014: should reject but accepts)*
- [ ] Try creating a scenario with name = `<script>alert(1)</script>` → *(BUG-015: stored XSS)*
- [ ] Set a wait node duration to 0 → *(BUG-016: should reject but accepts)*
- [ ] Set a wait node duration to -5 → *(BUG-016: should reject but accepts)*

---

## MFE-10: Field Statistics

### MFE-10.1: Statistics Page Layout

**Steps:**
1. In the sidebar, under **"Аналитика"**, click **"Статистика полей"** (Field Statistics)

**What to check:**
- [ ] URL is `/statistics/field`
- [ ] Page heading shows **"Статистика полей"**
- [ ] Two tabs visible:
  1. **"Поля схемы клиента"** (Client Schema Fields)
  2. **"Поля схемы событий"** (Event Schema Fields)

---

### MFE-10.2: Customer Field Statistics

**Steps:**
1. On the statistics page, ensure **"Поля схемы клиента"** tab is active
2. You should see a prompt: **"Выберите поле для просмотра значений"** (Select a field to view values)
3. Click the **"Выберите поле"** (Select Field) dropdown
4. Select **"gender"** (or its display name)

**What to check:**
- [ ] Dropdown lists all customer fields
- [ ] After selecting "gender": value distribution chart or table appears
- [ ] Values shown: "female" (4), "male" (5), "other" (1) — matching our test data
- [ ] Visualization is clear (bar chart, pie chart, or table)

---

### MFE-10.3: Event Field Statistics

**Steps:**
1. Switch to **"Поля схемы событий"** tab
2. Select an event field (e.g., "delivery_city")

**What to check:**
- [ ] Event fields listed in dropdown
- [ ] Value distribution shows correctly (Tashkent: 9, Samarkand: 5, Bukhara: 4)

---

## MFE-11: Files

### MFE-11.1: Files Page

**Steps:**
1. In the sidebar, under **"Данные"**, click **"Файлы"** (Files)

**What to check:**
- [ ] URL is `/data/files`
- [ ] Page loads without errors
- [ ] Upload interface or file list visible
- [ ] If files were uploaded, they appear in the list

---

## Data Preparation Guide

> This section explains how to set up test data for manual QA of UDAF and Segmentation features. This is the **most important section** for day-to-day QA work.

### Why Data Preparation Matters

Segmentation and UDAF testing require **known data** so you can predict the correct results. If you don't know exactly what data is in the system, you can't verify if a segment count of "5" is correct or a UDAF sum of "$1,200" is right.

### Option A: Use the Automated Test Tenant (Recommended for API Verification)

The automated test suite provisions a fresh tenant with known data. If you just need to verify API logic, run:

```bash
npm run test:business
```

This creates a tenant with exactly 10 customers and 18 events (see tables below), runs all assertions, and reports results. You don't need to touch the UI.

### Option B: Prepare Data Manually via UI (For Frontend Testing)

If you need to test the UI with known data, you'll need to ingest data into the shared test tenant. The easiest way is to use the Ingest API (it's public, no auth needed):

#### Step 1: Ingest Test Customers

Open a terminal and run this curl command (replace `TENANT_ID` with the actual tenant ID from `.env`):

```bash
curl -X POST "https://cdpv2.ssd.uz/cdp-ingest/ingest/tenant/1762934640267/async/customers" \
  -H "Content-Type: application/json" \
  -d '[
    {"primary_id":"9900000001","first_name":"Alice","last_name":"Anderson","email":"alice@test.com","gender":"female","age":35,"is_adult":true,"is_subscribed":true,"income":75000,"phone_number":"+1001"},
    {"primary_id":"9900000002","first_name":"Carol","last_name":"Chen","email":"carol@test.com","gender":"female","age":17,"is_adult":false,"is_subscribed":true,"income":0,"phone_number":"+1002"},
    {"primary_id":"9900000003","first_name":"Eve","last_name":"Evans","email":"eve@test.com","gender":"female","age":25,"is_adult":true,"is_subscribed":false,"income":45000,"phone_number":"+1003"},
    {"primary_id":"9900000004","first_name":"Grace","last_name":"Garcia","email":"grace@test.com","gender":"female","age":31,"is_adult":true,"is_subscribed":true,"income":88000,"phone_number":"+1004"},
    {"primary_id":"9900000005","first_name":"Bob","last_name":"Brown","email":"bob@test.com","gender":"male","age":40,"is_adult":true,"is_subscribed":false,"income":120000,"phone_number":"+1005"},
    {"primary_id":"9900000006","first_name":"Dave","last_name":"Davis","email":"dave@test.com","gender":"male","age":51,"is_adult":true,"is_subscribed":true,"income":250000,"phone_number":"+1006"},
    {"primary_id":"9900000007","first_name":"Frank","last_name":"Foster","email":"frank@test.com","gender":"male","age":65,"is_adult":true,"is_subscribed":false,"income":180000,"phone_number":"+1007"},
    {"primary_id":"9900000008","first_name":"Hana","last_name":"Hayashi","email":"hana@test.com","gender":"other","age":25,"is_adult":true,"is_subscribed":true,"income":0,"phone_number":"+1008"},
    {"primary_id":"9900000009","first_name":"Ivan","last_name":"Ivanov","email":"ivan@test.com","gender":"male","age":26,"is_adult":true,"is_subscribed":true,"income":55000,"phone_number":"+1009"},
    {"primary_id":"9900000010","first_name":"Jun","last_name":"Jeong","email":"jun@test.com","gender":"male","age":15,"is_adult":false,"is_subscribed":false,"income":0,"phone_number":"+1010"}
  ]'
```

#### Step 2: Wait for Data Processing

After ingestion, wait **1-2 minutes** for data to become queryable. You can verify by going to **Клиенты** (Clients) page and checking if the count has increased.

#### Step 3: Ingest Test Events

```bash
curl -X POST "https://cdpv2.ssd.uz/cdp-ingest/ingest/tenant/1762934640267/async/events" \
  -H "Content-Type: application/json" \
  -d '[
    {"primary_id":"9900000001","event_type":"purchase","purchase_id":"PUR-001","purchase_status":"completed","total_price":150.00,"delivery_cost":10,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"card","total_quantity":2},
    {"primary_id":"9900000001","event_type":"purchase","purchase_id":"PUR-002","purchase_status":"completed","total_price":200.00,"delivery_cost":15,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"card","total_quantity":3},
    {"primary_id":"9900000001","event_type":"purchase","purchase_id":"PUR-003","purchase_status":"completed","total_price":50.00,"delivery_cost":5,"delivery_city":"Samarkand","delivery_country":"UZ","payment_type":"cash","total_quantity":1},
    {"primary_id":"9900000002","event_type":"purchase","purchase_id":"PUR-004","purchase_status":"pending","total_price":30.00,"delivery_cost":5,"delivery_city":"Bukhara","delivery_country":"UZ","payment_type":"cash","total_quantity":1},
    {"primary_id":"9900000004","event_type":"purchase","purchase_id":"PUR-005","purchase_status":"completed","total_price":500.00,"delivery_cost":20,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"card","total_quantity":5},
    {"primary_id":"9900000004","event_type":"purchase","purchase_id":"PUR-006","purchase_status":"completed","total_price":75.00,"delivery_cost":10,"delivery_city":"Bukhara","delivery_country":"UZ","payment_type":"card","total_quantity":1},
    {"primary_id":"9900000005","event_type":"purchase","purchase_id":"PUR-007","purchase_status":"completed","total_price":999.99,"delivery_cost":50,"delivery_city":"Samarkand","delivery_country":"UZ","payment_type":"card","total_quantity":10},
    {"primary_id":"9900000005","event_type":"purchase","purchase_id":"PUR-008","purchase_status":"completed","total_price":500.00,"delivery_cost":25,"delivery_city":"Samarkand","delivery_country":"UZ","payment_type":"cash","total_quantity":5},
    {"primary_id":"9900000006","event_type":"purchase","purchase_id":"PUR-009","purchase_status":"completed","total_price":300.00,"delivery_cost":15,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"card","total_quantity":3},
    {"primary_id":"9900000006","event_type":"purchase","purchase_id":"PUR-010","purchase_status":"completed","total_price":450.00,"delivery_cost":20,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"card","total_quantity":4},
    {"primary_id":"9900000006","event_type":"purchase","purchase_id":"PUR-011","purchase_status":"completed","total_price":750.00,"delivery_cost":30,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"cash","total_quantity":7},
    {"primary_id":"9900000006","event_type":"purchase","purchase_id":"PUR-012","purchase_status":"completed","total_price":500.00,"delivery_cost":25,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"card","total_quantity":5},
    {"primary_id":"9900000007","event_type":"purchase","purchase_id":"PUR-013","purchase_status":"completed","total_price":350.00,"delivery_cost":15,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"cash","total_quantity":3},
    {"primary_id":"9900000007","event_type":"purchase","purchase_id":"PUR-014","purchase_status":"completed","total_price":600.00,"delivery_cost":30,"delivery_city":"Samarkand","delivery_country":"UZ","payment_type":"card","total_quantity":6},
    {"primary_id":"9900000007","event_type":"purchase","purchase_id":"PUR-015","purchase_status":"completed","total_price":400.00,"delivery_cost":20,"delivery_city":"Samarkand","delivery_country":"UZ","payment_type":"card","total_quantity":4},
    {"primary_id":"9900000008","event_type":"purchase","purchase_id":"PUR-016","purchase_status":"completed","total_price":25.00,"delivery_cost":5,"delivery_city":"Tashkent","delivery_country":"UZ","payment_type":"cash","total_quantity":1},
    {"primary_id":"9900000009","event_type":"purchase","purchase_id":"PUR-017","purchase_status":"completed","total_price":200.00,"delivery_cost":10,"delivery_city":"Bukhara","delivery_country":"UZ","payment_type":"card","total_quantity":2},
    {"primary_id":"9900000009","event_type":"purchase","purchase_id":"PUR-018","purchase_status":"completed","total_price":180.00,"delivery_cost":10,"delivery_city":"Bukhara","delivery_country":"UZ","payment_type":"cash","total_quantity":2}
  ]'
```

#### Step 4: Wait for UDAF Recalculation

After event ingestion, wait **5-7 minutes** for UDAF values to be recalculated. Only then will aggregate values return correct results.

---

### Reference: Expected Values for Segmentation Testing

Use these expected counts to verify segmentation previews:

| Predicate | Expected Count | Matching Customers |
|-----------|---------------|-------------------|
| gender = "female" | **4** | Alice, Carol, Eve, Grace |
| gender = "male" | **5** | Bob, Dave, Frank, Ivan, Jun |
| gender = "other" | **1** | Hana |
| gender != "female" | **6** | Bob, Dave, Frank, Hana, Ivan, Jun |
| gender IN ["female","other"] | **5** | Alice, Carol, Eve, Grace, Hana |
| is_adult = true | **8** | Alice, Eve, Grace, Bob, Dave, Frank, Hana, Ivan |
| is_adult = false | **2** | Carol (17), Jun (15) |
| is_subscribed = true | **6** | Alice, Carol, Grace, Dave, Hana, Ivan |
| is_subscribed = false | **4** | Eve, Bob, Frank, Jun |
| income > 100000 | **3** | Bob ($120K), Dave ($250K), Frank ($180K) |
| income >= 75000 | **5** | Alice ($75K), Grace ($88K), Bob ($120K), Dave ($250K), Frank ($180K) |
| income = 0 | **3** | Carol, Hana, Jun |
| age < 18 | **2** | Carol (17), Jun (15) |
| age >= 50 | **2** | Dave (51), Frank (65) |
| AND(female, adult) | **3** | Alice (35), Eve (25), Grace (31) |
| AND(male, subscribed) | **2** | Dave, Ivan |
| OR(female, subscribed) | **7** | Alice, Carol, Eve, Grace, Dave, Hana, Ivan |
| AND(adult, income > 0) | **6** | Alice, Eve, Grace, Bob, Dave, Frank |

---

### Reference: Expected Values for UDAF Testing

Use these to verify UDAF calculations per customer:

#### SUM of total_price (all events)

| Customer | Events | SUM total_price |
|----------|--------|----------------|
| Alice | PUR-001 ($150) + PUR-002 ($200) + PUR-003 ($50) | **$400.00** |
| Carol | PUR-004 ($30) | **$30.00** |
| Eve | (no events) | **$0.00** or null |
| Grace | PUR-005 ($500) + PUR-006 ($75) | **$575.00** |
| Bob | PUR-007 ($999.99) + PUR-008 ($500) | **$1,499.99** |
| Dave | PUR-009 ($300) + PUR-010 ($450) + PUR-011 ($750) + PUR-012 ($500) | **$2,000.00** |
| Frank | PUR-013 ($350) + PUR-014 ($600) + PUR-015 ($400) | **$1,350.00** |
| Hana | PUR-016 ($25) | **$25.00** |
| Ivan | PUR-017 ($200) + PUR-018 ($180) | **$380.00** |
| Jun | (no events) | **$0.00** or null |

#### COUNT of events

| Customer | COUNT |
|----------|-------|
| Alice | **3** |
| Carol | **1** |
| Eve | **0** |
| Grace | **2** |
| Bob | **2** |
| Dave | **4** |
| Frank | **3** |
| Hana | **1** |
| Ivan | **2** |
| Jun | **0** |

#### Events by City (for filtered UDAF testing)

| City | Events | Customers |
|------|--------|-----------|
| Tashkent | **9** | Alice (2), Grace (1), Dave (4), Frank (1), Hana (1) |
| Samarkand | **5** | Alice (1), Bob (2), Frank (2) |
| Bukhara | **4** | Carol (1), Grace (1), Ivan (2) |

**Example filtered UDAF:** SUM total_price WHERE delivery_city = "Tashkent" for Dave:
- PUR-009 ($300) + PUR-010 ($450) + PUR-011 ($750) + PUR-012 ($500) = **$2,000**
- *(Note: BUG-002 — filtered UDAFs may return null/0)*

---

### Reference: Complete Customer Data Card

For quick reference when verifying client detail views:

```
┌─────────────────────────────────────────────────────┐
│ #1  Alice Anderson      alice@test.com    +1001     │
│     Gender: female   Age: 35   Adult: YES           │
│     Subscribed: YES   Income: $75,000               │
│     Events: 3 (Tashkent ×2, Samarkand ×1)          │
├─────────────────────────────────────────────────────┤
│ #2  Carol Chen          carol@test.com    +1002     │
│     Gender: female   Age: 17   Adult: NO            │
│     Subscribed: YES   Income: $0                    │
│     Events: 1 (Bukhara ×1)                          │
├─────────────────────────────────────────────────────┤
│ #3  Eve Evans           eve@test.com      +1003     │
│     Gender: female   Age: 25   Adult: YES           │
│     Subscribed: NO    Income: $45,000               │
│     Events: 0                                        │
├─────────────────────────────────────────────────────┤
│ #4  Grace Garcia        grace@test.com    +1004     │
│     Gender: female   Age: 31   Adult: YES           │
│     Subscribed: YES   Income: $88,000               │
│     Events: 2 (Tashkent ×1, Bukhara ×1)            │
├─────────────────────────────────────────────────────┤
│ #5  Bob Brown           bob@test.com      +1005     │
│     Gender: male     Age: 40   Adult: YES           │
│     Subscribed: NO    Income: $120,000              │
│     Events: 2 (Samarkand ×2)                        │
├─────────────────────────────────────────────────────┤
│ #6  Dave Davis          dave@test.com     +1006     │
│     Gender: male     Age: 51   Adult: YES           │
│     Subscribed: YES   Income: $250,000              │
│     Events: 4 (Tashkent ×4)                         │
├─────────────────────────────────────────────────────┤
│ #7  Frank Foster        frank@test.com    +1007     │
│     Gender: male     Age: 65   Adult: YES           │
│     Subscribed: NO    Income: $180,000              │
│     Events: 3 (Tashkent ×1, Samarkand ×2)          │
├─────────────────────────────────────────────────────┤
│ #8  Hana Hayashi        hana@test.com     +1008     │
│     Gender: other    Age: 25   Adult: YES           │
│     Subscribed: YES   Income: $0                    │
│     Events: 1 (Tashkent ×1)                         │
├─────────────────────────────────────────────────────┤
│ #9  Ivan Ivanov         ivan@test.com     +1009     │
│     Gender: male     Age: 26   Adult: YES           │
│     Subscribed: YES   Income: $55,000               │
│     Events: 2 (Bukhara ×2)                          │
├─────────────────────────────────────────────────────┤
│ #10 Jun Jeong           jun@test.com      +1010     │
│     Gender: male     Age: 15   Adult: NO            │
│     Subscribed: NO    Income: $0                    │
│     Events: 0                                        │
└─────────────────────────────────────────────────────┘
```
