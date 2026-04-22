# QA Coverage Tracker — CDP (cdpv2.ssd.uz)

> Updated incrementally by `/qa-crawl`. Each session covers ONE page.

## Coverage Legend

| Symbol | Meaning |
|--------|---------|
| :white_check_mark: | Crawled + has test assertions |
| :eyes: | Crawled but no test yet |
| :x: | Known but not crawled |
| :construction: | Partially covered |

## Routes

| Route | Page | Crawl Status | Spec File | Last Crawled |
|-------|------|--------------|-----------|--------------|
| `/auth/sign-in` | Login | :x: | auth.spec.ts | — |
| `/auth/sign-up` | Registration | :x: | auth.spec.ts | — |
| `/dashboard` | Dashboard | :white_check_mark: | dashboard.spec.ts, navigation.spec.ts | 2026-03-29 |
| `/data/clients` | Clients (list) | :white_check_mark: | clients.spec.ts | 2026-03-29 |
| `/data/clients/{id}` | Client Detail | :white_check_mark: | clients.spec.ts | 2026-03-29 |
| `/data/events/{id}` | Events (per type) | :white_check_mark: | events.spec.ts | 2026-03-29 |
| `/data/scenario` | Scenarios (list) | :white_check_mark: | scenarios.spec.ts | 2026-03-29 |
| `/data/scenario/{uuid}` | Scenario Builder | :white_check_mark: | scenarios.spec.ts | 2026-03-29 |
| `/data/files` | Files | :white_check_mark: | files.spec.ts | 2026-03-29 |
| `/marketing/aggregate` | Aggregates | :white_check_mark: | aggregates.spec.ts | 2026-03-29 |
| `/marketing/segments` | Segments (list) | :white_check_mark: | segments.spec.ts | 2026-03-29 |
| `/marketing/segments/{uuid}` | Segment Detail | :white_check_mark: | segments.spec.ts | 2026-03-29 |
| `/marketing/campaigns` | Campaigns | :x: | campaigns.spec.ts | — |
| `/marketing/communication` | Communications | :x: | communications.spec.ts | — |
| `/statistics/field` | Field Statistics | :x: | statistics.spec.ts | — |

## Per-Page Element Coverage

### `/dashboard` — Dashboard (Панель управления)
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** dashboard.spec.ts (14 tests), navigation.spec.ts (10 tests)

#### Sidebar Navigation

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Link "Панель управления" | :white_check_mark: | navigation.spec.ts:L8 | Visibility check |
| Section "Данные" heading | :white_check_mark: | navigation.spec.ts:L11 | Visibility check |
| Link "Клиенты 342279" (with count) | :white_check_mark: | navigation.spec.ts:L12, dashboard.spec.ts:L219-248 | Navigation + count assertions |
| Button "События 66245" (dropdown trigger) | :white_check_mark: | navigation.spec.ts:L13, events.spec.ts:L6 | Opens event type dropdown |
| Link "Сценарий" | :white_check_mark: | navigation.spec.ts:L14 | Navigation test |
| Link "Файлы" | :white_check_mark: | navigation.spec.ts:L15 | Navigation test |
| Section "Маркетинг" heading | :white_check_mark: | navigation.spec.ts:L18 | Visibility check |
| Link "Агрегаты" | :white_check_mark: | navigation.spec.ts:L19 | Navigation test |
| Link "Сегменты" | :white_check_mark: | navigation.spec.ts:L20 | Navigation test |
| Link "Рассылки" | :white_check_mark: | navigation.spec.ts:L21 | Navigation test |
| Link "Коммуникации" | :white_check_mark: | navigation.spec.ts:L22 | Navigation test |
| Section "Аналитика" heading | :white_check_mark: | navigation.spec.ts:L25 | Visibility check |
| Link "Статистика полей" | :white_check_mark: | navigation.spec.ts:L26 | Navigation test |
| Tenant identifier "cdp_1762934640267" (sidebar bottom) | :eyes: | — | Shows tenant name, not tested directly |
| Separator + tenant avatar | :eyes: | — | Visual element, no test |

#### Tab Bar

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Tab "Артефакты арендатора" (default selected) | :white_check_mark: | dashboard.spec.ts:L12,L31 | Visibility + aria-selected |
| Tab "Поля схемы клиента" | :white_check_mark: | dashboard.spec.ts:L14,L81 | Visibility + click + content |
| Tab "Поля схемы событий" | :white_check_mark: | dashboard.spec.ts:L17,L127 | Visibility + click + content |
| Tab "Конкретные сопоставления полей" | :white_check_mark: | dashboard.spec.ts:L19,L155 | Visibility + click |
| Tab "Создать шаблон" | :white_check_mark: | dashboard.spec.ts:L23,L183 | Visibility + click + form fields |

#### Tab: Артефакты арендатора (Tenant Artifacts)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| "База данных" + tenant DB name | :white_check_mark: | dashboard.spec.ts:L43 | Visibility |
| Copy button (DB name) | :eyes: | — | 9 copy buttons on page, none tested |
| "isReady" + "true" | :white_check_mark: | dashboard.spec.ts:L44-45 | Value assertion |
| "Загрузка клиентов" + job name | :white_check_mark: | dashboard.spec.ts:L49 | Visibility |
| Copy button (customer job) | :eyes: | — | Not tested |
| "Загрузка событий" + job name | :white_check_mark: | dashboard.spec.ts:L50 | Visibility |
| Copy button (event job) | :eyes: | — | Not tested |
| "Таблица клиентов" + "customers" | :eyes: | — | Not tested directly |
| Copy button (customers table) | :eyes: | — | Not tested |
| "Таблица событий" + "events" | :eyes: | — | Not tested directly |
| Copy button (events table) | :eyes: | — | Not tested |
| "ID арендатора" + value | :eyes: | — | Not tested directly |
| "Топик клиентов" + topic name | :white_check_mark: | dashboard.spec.ts:L54 | Visibility |
| Copy button (customer topic) | :eyes: | — | Not tested |
| "Топик событий" + topic name | :white_check_mark: | dashboard.spec.ts:L55 | Visibility |
| Copy button (event topic) | :eyes: | — | Not tested |
| No error states / stuck spinners | :construction: | dashboard.spec.ts:L58-73 | Soft check, no hard assertion |

#### Tab: Поля схемы клиента (Customer Schema Fields)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Button "Применить черновики" (disabled) | :eyes: | — | Disabled by default, no test |
| Button "Отменить черновики" (disabled) | :eyes: | — | Disabled by default, no test |
| Button "Добавить" (add field) | :eyes: | — | Not tested |
| Table with columns: Название, API имя, Тип данных, Множественное значение, Доступ | :construction: | dashboard.spec.ts:L88-105 | Checks table/types exist but not specific columns |
| Row: cdp_created_at (DATETIME, hidden, system) | :eyes: | — | Not tested individually |
| Row: primary_id (BIGINT, required, system) | :white_check_mark: | dashboard.spec.ts:L117 | primary_id visibility check |
| Row: birthdate (DATE, optional) | :eyes: | — | |
| Row: birth_year (BIGINT, optional) | :eyes: | — | |
| Row: customer_age (BIGINT, optional) | :eyes: | — | |
| Row: api_customer_name_first (VARCHAR, required) | :eyes: | — | |
| Row: customer_interests (VARCHAR, multi-value) | :eyes: | — | Only multi-value field |
| Row: api_customer_name_last (VARCHAR, required) | :eyes: | — | |
| Row: phone_number (BIGINT, optional) | :eyes: | — | |
| Row: income (DOUBLE, optional) | :eyes: | — | |
| Row: y_income (DOUBLE, optional) | :eyes: | — | |
| Row: email (VARCHAR, optional) | :eyes: | — | |
| Row: first_name (VARCHAR, optional) | :eyes: | — | |
| Row: gender (VARCHAR, optional) | :eyes: | — | |
| Row: is_adult (BOOL, optional) | :eyes: | — | |
| Row: last_name1 (VARCHAR, optional) | :eyes: | — | |
| Row: is_subscribed (BOOL, optional) | :eyes: | — | |
| Row: subscription_list (JSON, optional) | :eyes: | — | |
| Row: user_local_time (DATETIME, optional) | :eyes: | — | |
| Edit button per row (pencil icon) | :eyes: | — | Disabled for system fields, enabled for custom |
| Field types: BIGINT, VARCHAR, DOUBLE, BOOL, DATE, DATETIME, JSON | :construction: | dashboard.spec.ts:L100-103 | Checks types regex, not individual |
| 19 total fields (2 system + 17 custom) | :eyes: | — | Count not asserted |

#### Tab: Поля схемы событий (Event Schema Fields)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Event type and fields display | :construction: | dashboard.spec.ts:L122-146 | Checks for "purchase" text and type labels |
| Specific event field rows | :eyes: | — | Not individually tested |

#### Tab: Конкретные сопоставления полей (Concrete Field Mappings)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Tab switch + content | :construction: | dashboard.spec.ts:L149-175 | Switches tab, soft check for col__ content |
| Mapping table/list details | :eyes: | — | Content structure not deeply tested |

#### Tab: Создать шаблон (Create Template)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Tab switch | :white_check_mark: | dashboard.spec.ts:L183-185 | aria-selected check |
| Form fields (textbox, textarea) | :construction: | dashboard.spec.ts:L187-199 | Checks count >= 1, not specific fields |
| Save button (Сохранить/Save/Создать/Create) | :white_check_mark: | dashboard.spec.ts:L204-216 | Visibility check |
| Template name field | :eyes: | — | Not individually identified |
| Template subject field | :eyes: | — | Not individually identified |
| Template body field | :eyes: | — | Not individually identified |

### `/data/clients` — Clients List (Клиенты)
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** clients.spec.ts (12 tests)

#### Page Header & Controls

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Heading "Клиенты" | :white_check_mark: | clients.spec.ts:L10 | Visibility |
| Button "Сбросить фильтры" (Reset filters) | :white_check_mark: | clients.spec.ts:L23 | Visibility check |
| Button "Фильтры" (Filters) | :white_check_mark: | clients.spec.ts:L17-18 | Visibility + opens filter panel |
| Button "Добавить столбцы" (Add columns) | :white_check_mark: | clients.spec.ts:L20-21 | Visibility + opens column picker |
| Separator below heading | :eyes: | — | Visual element |

#### Data Table

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Table visibility | :white_check_mark: | clients.spec.ts:L12 | Role=table assertion |
| Column headers visible | :white_check_mark: | clients.spec.ts:L42-46 | Count >= 2 |
| Default columns: phone_number, email, isAdult, avg delivery cost, sum purchase 1, sum purchase 2 | :eyes: | — | 6 specific columns not asserted by name |
| Sort button per column (ascending icon) | :eyes: | — | Two icon buttons per column header, not tested |
| Sort button per column (descending icon) | :eyes: | — | Not tested |
| Data rows (10 per page) | :white_check_mark: | clients.spec.ts:L32-39 | Row count > 1 |
| Cell click → navigates to client detail | :white_check_mark: | clients.spec.ts:L211-245 | URL change or detail panel check |
| Dash "-" for null values | :eyes: | — | Null values display as "-", not tested |

#### Pagination

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| "Всего:" total count label | :white_check_mark: | clients.spec.ts:L28 | Visibility |
| Total count value "342279" | :eyes: | — | Specific value not asserted |
| Page buttons (1, 2, 3, 4, 5 ... 34228) | :construction: | clients.spec.ts:L160-175 | Checks for next button, but actual page buttons are numbered |
| Previous page button (disabled on page 1) | :eyes: | — | Disabled state not tested |
| Next page button | :construction: | clients.spec.ts:L188-206 | Tries to find by name pattern, may not match |
| Page size input (default "10") | :eyes: | — | Textbox with value "10", not tested |
| Total count stable across pages | :construction: | clients.spec.ts:L177-207 | Test exists but relies on finding next button |

#### Filter Dialog

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Dialog title "Фильтры" | :construction: | clients.spec.ts:L56-64 | Opens filter, checks for combobox/select |
| "Вернуть применённые фильтры" button | :eyes: | — | Restore applied filters, not tested |
| "Сохранить" (Save) button | :eyes: | — | Save filter state, not tested |
| Group section with НЕ (NOT) switch | :eyes: | — | Boolean NOT toggle, not tested |
| AND/OR radio (И/ИЛИ) | :eyes: | — | Radio group, not tested |
| "Нет условий или групп" empty state | :eyes: | — | Initial empty message |
| "Добавить условие" (Add condition) button | :eyes: | — | Not tested directly |
| "Добавить группу" (Add group) button | :eyes: | — | Nested group support, not tested |
| Condition row: "Поле" field dropdown | :construction: | clients.spec.ts:L56-64 | Checks for combobox presence |
| Condition row: "Оператор" (disabled until field selected) | :construction: | clients.spec.ts:L67-79 | Checks for operator presence |
| Field dropdown — "Поля" group (19 customer fields) | :eyes: | — | All schema fields listed with types |
| Field dropdown — "Агрегаты" group (100+ aggregates) | :eyes: | — | Includes SQL injection test names from test runs |
| Delete condition button (trash icon) | :eyes: | — | Per-condition removal |
| Reset filters action | :white_check_mark: | clients.spec.ts:L81-98 | Click reset + verify total still visible |

#### Column Selector Dialog

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Dialog title "Добавить столбцы" | :construction: | clients.spec.ts:L107-121 | Opens picker, checks for checkboxes/switches |
| "6 столбцов, макс 10" counter | :eyes: | — | Column limit indicator, not tested |
| "Сбросить" (Reset) button | :eyes: | — | Reset column selection |
| "Сохранить" (Save) button | :eyes: | — | Save column selection |
| "Поля" group (15 available fields) | :eyes: | — | Excludes already-shown columns |
| "Агрегаты" group (100+ aggregates) | :eyes: | — | Click to toggle column |
| Toggle column on/off | :construction: | clients.spec.ts:L123-151 | Test expects checkboxes/switches, but UI uses clickable items |

### `/data/clients/{id}` — Client Detail View
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** clients.spec.ts (1 test — row click navigation only)
**URL example:** `/data/clients/221698`

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| "Назад" (Back) button | :eyes: | — | Returns to client list |
| Header "Клиент ID: 221698" | :eyes: | — | Client ID display |
| Section "Профиль клиента" (Customer Profile) | :construction: | clients.spec.ts:L230-236 | Checks for "Профиль" text loosely |
| "Добавлено в систему:" + date "13.03.2026 16:14" | :eyes: | — | Creation timestamp |
| "Показать остальные" (Show more) button | :eyes: | — | Expands profile fields, not tested |
| Section "Агрегаты" (Aggregates) | :eyes: | — | Shows ALL aggregates with per-customer values |
| Aggregate name + value pairs (100+ entries) | :eyes: | — | All showing "0" for this customer |
| SQL injection names rendered in aggregate list | :eyes: | — | `'; DROP TABLE customers; --` etc. rendered as text |
| Section "История событий" (Event History) | :eyes: | — | Not tested |
| Event type "add_to_cart" + count | :eyes: | — | Count = 0 |
| Event type "login" + count | :eyes: | — | Count = 0 |
| Event type "purchase" + count | :eyes: | — | Count = 0 |
| Event type "purchase_item" + count | :eyes: | — | Count = 0 |
| Event type "search_item" + count | :eyes: | — | Count = 0 |
| Event type "search_item_2_1" + count | :eyes: | — | Count = 0 |
| Event type "search_item_3" + count | :eyes: | — | Count = 0 |
| Event type "session_end" + count | :eyes: | — | Count = 0 |
| Event type "session_start" + count | :eyes: | — | Count = 0 |
| Event type "test" + count | :eyes: | — | Count = 0 |
| Event type "test_event" + count | :eyes: | — | Count = 0 |
| **10 console errors** from `/calculate` endpoints | :eyes: | — | Aggregate calculate API returns errors for some UDAFs |

### `/data/events/{id}` — Events Table (События)
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** events.spec.ts (9 tests)
**URL example:** `/data/events/100?title=purchase` (61,516 events)

#### Events Dropdown (Sidebar)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Button "События 66245" opens dropdown dialog | :white_check_mark: | events.spec.ts:L6, navigation.spec.ts:L86 | Opens event type list |
| Dialog lists 11 event types with counts | :construction: | events.spec.ts:L10-12, L21-23 | Tests check for "purchase" link, not all 11 types |
| Event type "add_to_cart" → `/data/events/102` (0) | :eyes: | — | Not individually tested |
| Event type "login" → `/data/events/103` (0) | :eyes: | — | Not tested |
| Event type "purchase" → `/data/events/100` (61,516) | :white_check_mark: | events.spec.ts:L34-44 | Navigation + URL check |
| Event type "purchase_item" → `/data/events/101` (3,522) | :eyes: | — | Not tested |
| Event type "search_item" → `/data/events/104` (0) | :eyes: | — | Not tested |
| Event type "search_item_2_1" → `/data/events/105` (0) | :eyes: | — | Not tested |
| Event type "search_item_3" → `/data/events/106` (0) | :eyes: | — | Not tested |
| Event type "session_end" → `/data/events/11` (0) | :eyes: | — | Not tested |
| Event type "session_start" → `/data/events/10` (14) | :eyes: | — | Not tested |
| Event type "test" → `/data/events/107` (0) | :eyes: | — | Not tested |
| Event type "test_event" → `/data/events/108` (1,193) | :eyes: | — | Not tested |

#### Page Header & Controls

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Heading "События purchase" (dynamic per event type) | :eyes: | — | Title includes event type name, not asserted |
| Button "Сбросить фильтры" (Reset filters) | :white_check_mark: | events.spec.ts:L136-141 | Visibility |
| Button "Фильтры" (Filters) | :white_check_mark: | events.spec.ts:L89-96 | Visibility + opens panel |
| Button "Добавить столбцы" (Add columns) | :white_check_mark: | events.spec.ts:L93-96 | Visibility |

#### Data Table

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Table visibility | :white_check_mark: | events.spec.ts:L72-73 | Table role assertion |
| Default columns: Customer Primary ID, Event ID, Event Type, Event Created At CDP | :construction: | events.spec.ts:L80-87 | Count >= 2, specific names not asserted |
| Customer Primary ID — only 1 sort button (others have 2) | :eyes: | — | UI inconsistency: 1 vs 2 sort/filter buttons |
| Sort buttons per column (icon buttons) | :eyes: | — | Not tested |
| Data rows (10 per page) | :white_check_mark: | events.spec.ts:L72-78 | Row count > 1 |
| Alternating empty rows between data rows (expand containers) | :eyes: | — | Hidden expandable detail rows |
| Row click → expands to show customer's event timestamps | :eyes: | — | Shows chronological list of events for that customer |
| "Показать ещё 10" (Show more) button in expanded row | :eyes: | — | Lazy-loads more events for customer |
| Cell values: Customer ID, Event ID (int64), Type ID, DateTime | :eyes: | — | Data format not tested |

#### Pagination

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| "Всего:" total count "61516" | :white_check_mark: | events.spec.ts:L98-100 | Visibility of "Всего:" |
| Page buttons (1-5...6152) | :eyes: | — | Numbered page buttons not tested |
| Previous page button (disabled on page 1) | :eyes: | — | Disabled state not tested |
| Next page button | :eyes: | — | Not tested |
| Page size input ("10") | :eyes: | — | Not tested |

#### Filter Panel

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Filter dialog opens | :white_check_mark: | events.spec.ts:L123-134 | Checks for combobox/select |
| Field selector with event fields | :eyes: | — | Not explored in this crawl (same structure as clients) |
| Operator selector | :eyes: | — | Not explored |

#### Column Selector

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Column selector opens | :white_check_mark: | events.spec.ts:L144-173 | Checks for checkboxes/switches |
| Event field toggles | :eyes: | — | Not explored in this crawl |

### `/data/scenario` — Scenarios List (Сценарии)
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** scenarios.spec.ts (7 tests)

#### Page Header & Controls

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Heading "Сценарии" | :white_check_mark: | scenarios.spec.ts:L13 | Visibility |
| Button "Добавить" (Add) | :white_check_mark: | scenarios.spec.ts:L31 | Visibility |

#### Scenario Table

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Table visibility | :white_check_mark: | scenarios.spec.ts:L14 | Role=table assertion |
| Column "Название" (Name) | :white_check_mark: | scenarios.spec.ts:L21 | Column header visibility |
| Column "Создано" (Created) | :white_check_mark: | scenarios.spec.ts:L24 | Column header visibility |
| Column "Статус" (Status) | :white_check_mark: | scenarios.spec.ts:L27 | Column header visibility |
| Data rows with scenario names | :white_check_mark: | scenarios.spec.ts:L40-42 | Row count > 1 |
| Status badge "Новый" (New) | :white_check_mark: | scenarios.spec.ts:L46 | First row status text |
| Date format: ISO 8601 (2026-03-29T10:36:49.047819Z) | :eyes: | — | Raw ISO format, not user-friendly |
| Row click → navigates to builder (`/data/scenario/{uuid}`) | :white_check_mark: | scenarios.spec.ts:L97-99 | URL change check |
| No pagination controls visible | :eyes: | — | All scenarios on one page? May need pagination when list grows |
| XSS payload in scenario name (`<script>alert("xss")</script>`) | :construction: | scenarios.spec.ts:L212-243 | BUG-015: stored as-is, renders as text (not executed) |

#### Creation Dialog (Modal)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Dialog title "Создать сценарий" | :construction: | scenarios.spec.ts:L57-72 | Test checks for name input, not dialog title |
| Close button (X icon) | :eyes: | — | Modal dismiss, not tested |
| "Название" label + textbox | :white_check_mark: | scenarios.spec.ts:L64-65 | Name input visibility |
| Placeholder "Введите название" | :eyes: | — | Placeholder text not asserted |
| "Добавить" (Submit) button | :white_check_mark: | scenarios.spec.ts:L80-82 | Save/Create button visibility |
| Empty name submission | :construction: | scenarios.spec.ts:L171-209 | BUG-014: whitespace-only accepted |

### `/data/scenario/{uuid}` — Scenario Builder
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** scenarios.spec.ts (2 tests — builder open + node palette)
**URL example:** `/data/scenario/40146752-44a5-47ed-b6e7-932629d34b97`

#### Builder Header

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| "Сценарий:" label | :eyes: | — | Not tested |
| Editable scenario name textbox | :eyes: | — | Inline rename, not tested |
| Button "Сохранить сценарий" (Save) | :eyes: | — | Not tested |
| Button "Отменить изменения" (Cancel changes) | :eyes: | — | Not tested |

#### Node Palette (Left Sidebar)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| "Triggers" group heading | :construction: | scenarios.spec.ts:L139-142 | Tests look for trigger/action/branch buttons loosely |
| Node: "Trigger now" (draggable) | :eyes: | — | Not individually tested |
| Node: "Trigger on date" (draggable) | :eyes: | — | Not tested |
| Node: "Trigger on event" (draggable) | :eyes: | — | Not tested |
| "Actions" group heading | :eyes: | — | Not tested |
| Node: "Email" (draggable) | :eyes: | — | Not tested |
| Node: "Webhook" (draggable) | :eyes: | — | Not tested |
| "Operators" group heading | :eyes: | — | Not tested |
| Node: "Wait" (draggable) | :eyes: | — | Not tested |
| Node: "Branch" (draggable) | :eyes: | — | Not tested |

#### React Flow Canvas

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Canvas (application role) | :construction: | scenarios.spec.ts:L104-113 | Checks for react-flow/canvas/flow classes |
| Existing nodes (2 visible) | :eyes: | — | Node content not tested |
| Existing edges (1 visible) | :eyes: | — | Edge rendering not tested |
| Control Panel: "Zoom In" button | :eyes: | — | Not tested |
| Control Panel: "Zoom Out" button | :eyes: | — | Not tested |
| Control Panel: "Fit View" button | :eyes: | — | Not tested |
| Control Panel: "Toggle Interactivity" button | :eyes: | — | Not tested |
| Mini Map | :eyes: | — | Not tested |
| React Flow attribution link | :eyes: | — | Links to reactflow.dev |
| Drag-and-drop node from palette to canvas | :eyes: | — | Core interaction, not tested |
| Node configuration on click | :eyes: | — | Node settings panel unknown |
| Edge creation between nodes | :eyes: | — | Connection drawing not tested |

### `/data/files` — Files (Файлы)
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** files.spec.ts (4 tests)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| No page heading | :eyes: | — | Unlike other pages, no "Файлы" heading shown |
| "Выберите файл" label | :construction: | files.spec.ts:L29-39 | Test looks for upload controls by class/role |
| "Нажмите, чтобы выбрать файл" file picker button | :construction: | files.spec.ts:L23-38 | Test uses locator patterns, may match |
| "Загрузить" (Upload) button [disabled] | :construction: | files.spec.ts:L25-28 | Checks for upload button by name regex |
| Upload button disabled state (no file selected) | :eyes: | — | Disabled until file chosen, not asserted |
| No file list/table visible | :construction: | files.spec.ts:L46-57 | Test checks for table/items, page shows none |
| No drag-and-drop zone visible | :eyes: | — | Only click-to-choose, no drop zone styling |
| File type/size validation | :eyes: | — | Unknown — no file selected to test |
| Upload progress indicator | :eyes: | — | Unknown — no file uploaded |
| Post-upload file list | :eyes: | — | Unknown — no completed uploads visible |
| Sidebar navigation to files | :white_check_mark: | files.spec.ts:L60-64 | Navigation test |

### `/marketing/segments` — Segments List (Сегментация)
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** segments.spec.ts (9 tests)

#### Page Header & Controls

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Heading "Сегментация" | :white_check_mark: | segments.spec.ts:L12 | Visibility |
| Button "Добавить" (Add) | :white_check_mark: | segments.spec.ts:L16 | Visibility |

#### Segment Table

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Column "ID" (UUID) | :eyes: | — | Not directly asserted |
| Column "Название" (Name) | :eyes: | — | Not directly asserted |
| Action column (icon button per row) | :eyes: | — | Likely delete; not tested |
| Data rows (10 per page) | :construction: | segments.spec.ts:L27-29 | Checks "Всего:" visible but not row count |
| Row with empty name (BUG-003 confirmed) | :eyes: | — | UUID 474f06e8... has blank name |
| SQL injection names rendered as text | :eyes: | — | `'; DROP TABLE customers; --` etc. |
| XSS payload rendered as text | :eyes: | — | `<script>alert("xss")</script>` not executed |
| Row click → navigates to segment detail | :construction: | segments.spec.ts:L186-212 | Test clicks row, checks for edit UI |

#### Pagination

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| "Всего:" total count "149" | :white_check_mark: | segments.spec.ts:L22 | Visibility |
| Page buttons (1-5...15) | :eyes: | — | Not tested |
| Page size input ("10") | :eyes: | — | Not tested |

#### Creation Dialog (Modal)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Dialog title "Создать сегментацию" | :eyes: | — | Not asserted |
| Close button (X icon) | :eyes: | — | Not tested |
| "Название сегментации" textbox | :white_check_mark: | segments.spec.ts:L46-49 | Name input visibility |
| Placeholder "Введите значение" | :eyes: | — | Not asserted |
| Tab "≡ Segment" (default selected) | :eyes: | — | Tab for first segment definition |
| "+" button (add another segment tab) | :eyes: | — | Multi-segment support, not tested |
| Predicate builder: НЕ (NOT) switch | :eyes: | — | Not tested |
| Predicate builder: И/ИЛИ (AND/OR) radio | :construction: | segments.spec.ts:L154-182 | Test looks for AND/OR text after adding condition |
| "Нет условий или групп" empty state | :eyes: | — | Not asserted |
| "Добавить условие" (Add condition) button | :eyes: | — | Not directly tested |
| "Добавить группу" (Add group) button | :eyes: | — | Nested group support, not tested |
| Condition row: "Поле" field dropdown | :construction: | segments.spec.ts:L52-64 | Checks for combobox |
| Condition row: "Оператор" (disabled until field selected) | :construction: | segments.spec.ts:L67-91 | Soft check |
| Status area (live validation?) | :eyes: | — | Empty status region |
| "Предпросмотр" (Preview) button | :construction: | segments.spec.ts:L130-141 | Test clicks preview, waits for count |
| "Добавить сегментацию" (Save) button | :white_check_mark: | segments.spec.ts:L143-152 | Visibility |
| "Сбросить" (Reset) button | :eyes: | — | Not tested |
| Empty name validation (BUG-003) | :construction: | segments.spec.ts:L239-276 | Test attempts empty save, known bug |

### `/marketing/segments/{uuid}` — Segment Detail
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** segments.spec.ts (1 test — row click navigation)
**URL example:** `/marketing/segments/eb433f96-5500-4727-89dd-6fd53a446882`

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Header "Сегментация ID: {uuid}" | :eyes: | — | Not tested |
| "Название" label + segment name | :eyes: | — | Read-only display, not tested |
| "Сегменты: количество клиентов" chart heading | :eyes: | — | Bar chart title |
| Bar chart (application role) with axis 0-360000 | :eyes: | — | Visual chart, not tested |
| Segment tab "Segment A Updated" | :eyes: | — | Tab for each segment in definition |
| Predicate summary: "Группа AND" | :eyes: | — | Shows predicate structure read-only |
| No edit/delete buttons visible on detail page | :eyes: | — | Edit may require returning to list |
| **CRASH: segment with null predicate** | :eyes: | — | **BUG: `test_empty_segs` crashes with TypeError: Cannot read properties of null (reading 'length')** |

### `/marketing/aggregate` — Aggregates (Агрегаты)
**Crawl status:** :white_check_mark: Crawled 2026-03-29
**Existing tests:** aggregates.spec.ts (7 tests)

#### Page Header & Controls

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Heading "Агрегаты" | :white_check_mark: | aggregates.spec.ts:L11 | Visibility |
| Button "Добавить" (Add) | :white_check_mark: | aggregates.spec.ts:L15 | Visibility |

#### Aggregates Table

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Table with columns: ID (UUID), Название (Name) | :construction: | aggregates.spec.ts:L22-32 | Checks for table/cards, not specific columns |
| **No pagination** — all aggregates loaded at once | :eyes: | — | Unlike other pages; no "Всего:" counter, no page buttons |
| No action buttons per row (unlike segments) | :eyes: | — | Only ID + Name columns, no edit/delete |
| Rows with empty names (BUG-022 confirmed) | :eyes: | — | Multiple rows with just UUID, blank name |
| SQL injection test names in list | :eyes: | — | Massive test data pollution |
| Row click → navigates somewhere? | :construction: | aggregates.spec.ts:L133-167 | Test clicks row, checks for detail content |

#### Creation Dialog (Modal)

| Element / Interaction | Tested? | Test Location | Notes |
|-----------------------|---------|---------------|-------|
| Dialog title "Создать агрегат" | :eyes: | — | Not asserted |
| Close button (X icon) | :eyes: | — | Not tested |
| "Название агрегата" textbox | :white_check_mark: | aggregates.spec.ts:L48-50 | Name input visibility |
| "За всё время" (All time) time window button | :eyes: | — | Time window selector, not tested |
| "Функция" (Function) dropdown | :construction: | aggregates.spec.ts:L75-105 | Test looks for SUM/COUNT options |
| "Тип события" (Event type) dropdown | :construction: | aggregates.spec.ts:L53-65 | Test checks for combobox/select |
| "Поля" (Fields) dropdown [disabled until event type selected] | :construction: | aggregates.spec.ts:L117-129 | Counts selectors >= 2 |
| "Группировать события перед применением фильтра" switch | :eyes: | — | Group events before filter, not tested |
| Info icon (tooltip?) next to grouping switch | :eyes: | — | Not tested |
| Separator "Фильтр событий (необязательно)" | :eyes: | — | Optional event filter section |
| Event filter: predicate builder (NOT/AND/OR, conditions, groups) | :eyes: | — | Same structure as segments/clients filter, not tested |
| "Создать агрегат" (Create) button | :white_check_mark: | aggregates.spec.ts:L107-115 | Save button visibility |
| "Сбросить" (Reset) button | :eyes: | — | Not tested |

## Uncovered Paths

| Path / Trigger | Discovery Date | Notes |
|----------------|---------------|-------|
| `/auth/sign-up` registration form | 2026-03-29 | Tested in auth.spec.ts but not crawled by qa-crawl yet |
| Event row expand → customer event timeline | 2026-03-29 | Click row to see chronological events per customer with "Show more" pagination |
| Scenario node click → node config panel | 2026-03-29 | Unknown what opens when clicking a node on canvas |
| File upload flow (select → upload → result) | 2026-03-29 | Cannot safely test without uploading real data |

## Coverage Summary

| Metric | Count |
|--------|-------|
| Total known routes | 15 |
| Fully crawled | 10 |
| Not crawled | 5 |
| Total elements discovered | 256 |
| Elements with tests | 73 |
| Elements without tests | 183 |
| **Element coverage %** | **29%** |

## Crawl Log

| Date | Page Crawled | Elements Found | New Tests Needed | Notes |
|------|-------------|----------------|------------------|-------|
| 2026-03-29 | `/dashboard` | 62 | 38 | All 5 tabs explored; 9 copy buttons untested; Customer Schema tab has 19 field rows mostly untested individually; draft management buttons untested |
| 2026-03-29 | `/data/clients` + `/data/clients/{id}` | 53 | 41 | Filter dialog: AND/OR/NOT/groups fully discoverable but untested; Column selector uses clickable items not checkboxes; Client detail has 3 sections (Profile, Aggregates, Event History) — only profile loosely tested; 10 console errors on detail page from aggregate /calculate endpoints; 11 event types discovered |
| 2026-03-29 | `/data/events/{id}` | 37 | 26 | 11 event types in dropdown (only "purchase" tested); Row click expands to show customer event timeline with "Show more" lazy-load — totally untested; Customer Primary ID column has 1 sort button vs 2 for others (UI inconsistency) |
| 2026-03-29 | `/data/scenario` + `/data/scenario/{uuid}` | 37 | 26 | Creation dialog is a simple modal (name + submit); Builder has React Flow canvas with node palette (3 triggers, 2 actions, 2 operators), control panel, mini map; Drag-and-drop and node config entirely untested; Date format is raw ISO 8601; BUG-015 XSS payload visible in list |
| 2026-03-29 | `/data/files` | 11 | 8 | Minimal page: file picker + disabled upload button only; No heading, no file list, no drag-and-drop zone; Upload flow cannot be safely explored without real file; Existing tests use broad locator patterns that may not match actual UI |
| 2026-03-29 | `/marketing/segments` + `/{uuid}` | 37 | 28 | **NEW BUG: segment detail crashes (TypeError: null.length) when segment has null predicate**; Creation dialog has multi-segment tabs ("+" button), predicate builder with NOT/AND/OR, Preview/Save/Reset buttons; Detail page shows bar chart of customer counts + predicate summary; Action buttons per row in list (purpose unknown — likely delete) |
| 2026-03-29 | `/marketing/aggregate` | 19 | 14 | NO pagination — all aggregates loaded at once (performance concern for large lists); Creation dialog has 4 dropdowns (name, function, event type, fields), time window button, grouping switch, optional event filter with full predicate builder; No action buttons per row; Multiple rows with empty names (BUG-022) |
