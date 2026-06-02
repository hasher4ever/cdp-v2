"""One-shot script to file BUG-115 (data-testid request) into Jira.

Env vars required:
  JIRA_EMAIL  — e.g. abubakr.mirzaliev@ssd.uz
  JIRA_TOKEN  — Atlassian Cloud API token
"""
import os
import urllib.request
import json
import base64

JIRA_EMAIL = os.environ["JIRA_EMAIL"]
JIRA_TOKEN = os.environ["JIRA_TOKEN"]
AUTH = 'Basic ' + base64.b64encode(f'{JIRA_EMAIL}:{JIRA_TOKEN}'.encode()).decode()

def bullet(text):
    return {'type': 'listItem', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': text}]}]}

def li_code(testid, desc):
    parts = [{'type': 'text', 'text': testid, 'marks': [{'type': 'code'}]}]
    if desc:
        parts.append({'type': 'text', 'text': ' — ' + desc})
    return {'type': 'listItem', 'content': [{'type': 'paragraph', 'content': parts}]}

def heading(text):
    return {'type': 'heading', 'attrs': {'level': 4}, 'content': [{'type': 'text', 'text': text}]}

def section_list(rows):
    return {'type': 'bulletList', 'content': [li_code(t, d) for t, d in rows]}

adf = {'type': 'doc', 'version': 1, 'content': [
    {'type': 'paragraph', 'content': [
        {'type': 'text', 'text': 'Severity:', 'marks': [{'type': 'strong'}]},
        {'type': 'text', 'text': ' High — Playwright E2E coverage is currently selector-brittle and limited to top-level navigation + Russian i18n text matching. Adding data-testid attributes to a handful of critical elements unlocks reliable interaction tests for segment building, campaign sending, and customer triage — the core marketer journeys.'},
    ]},
    {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Why now:', 'marks': [{'type': 'strong'}]}]},
    {'type': 'bulletList', 'content': [
        bullet("Today's predicate-builder UI test had to skip its interaction half — couldn't locate field/operator/value dropdowns reliably."),
        bullet('Form-validation tests fall back to "first text input" patterns that miss when forms have multiple inputs.'),
        bullet("Pagination + search tests skip when buttons can't be located."),
        bullet('Every selector miss is a false negative — bug present but not caught.'),
    ]},
    heading('Critical: Segment builder (highest unblock value)'),
    section_list([
        ('segment-name-input', 'name field on create-segment form'),
        ('segment-save-btn', 'Save / Сохранить button on create-segment form'),
        ('segment-cancel-btn', 'Cancel / Отмена'),
        ('segment-preview-btn', 'Предпросмотр button'),
        ('segment-preview-count', 'the displayed customer count after preview'),
        ('predicate-add-condition-btn', 'Добавить условие'),
        ('predicate-add-group-btn', 'Добавить группу'),
        ('predicate-row', 'each rendered condition row (wrapper element)'),
        ('predicate-field-select', 'field dropdown inside a condition row'),
        ('predicate-operator-select', 'operator dropdown'),
        ('predicate-value-input', 'value input or multi-value input'),
        ('predicate-logical-op-toggle', 'AND/OR toggle for group'),
        ('predicate-negate-toggle', 'NOT toggle for group'),
        ('predicate-delete-btn', 'X button to remove a condition/group'),
    ]),
    heading('Critical: Campaign create form'),
    section_list([
        ('campaign-name-input', ''),
        ('campaign-commchan-select', ''),
        ('campaign-template-select', ''),
        ('campaign-include-segment-select', ''),
        ('campaign-exclude-segment-select', ''),
        ('campaign-save-btn', ''),
        ('campaign-preview-btn', ''),
        ('campaign-preview-count', ''),
        ('campaign-send-btn', ''),
    ]),
    heading('Critical: CommChan create + lifecycle'),
    section_list([
        ('commchan-name-input', ''),
        ('commchan-kind-select', ''),
        ('commchan-verify-btn', ''),
        ('commchan-activate-btn', 'Will exist when BUG-106 is fixed'),
        ('commchan-deactivate-btn', ''),
        ('commchan-state-badge', 'shows new/active/inactive'),
    ]),
    heading('Critical: List pages (segments / campaigns / commchans / clients)'),
    section_list([
        ('list-search-input', 'Поиск input — once BUG-111 is fixed'),
        ('list-add-btn', 'Добавить on each list page'),
        ('list-total-count', 'Всего: X — the displayed total'),
        ('list-row', 'wrapper for each data row'),
        ('list-row-name', 'name cell inside a row (used to find specific entity)'),
        ('list-pagination-next', 'next page button'),
        ('list-pagination-prev', 'prev page button'),
        ('list-pagination-page-N', 'specific page number button (dynamic)'),
    ]),
    heading('Important: Customer profile + Delete dialogs'),
    section_list([
        ('customer-name', 'first_name + last_name display element'),
        ('customer-email', 'email field display'),
        ('customer-fields-toggle', 'Показать остальные button'),
        ('confirm-delete-btn', 'Yes / Удалить on confirm dialog'),
        ('cancel-delete-btn', 'No / Отмена on confirm dialog'),
        ('toast-success', 'success toast wrapper'),
        ('toast-error', 'error toast wrapper'),
    ]),
    heading('How to add (Mantine pattern)'),
    {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Mantine components accept arbitrary data-* attributes. Example:'}]},
    {'type': 'codeBlock', 'attrs': {'language': 'tsx'}, 'content': [{'type': 'text', 'text': '<TextInput\n  data-testid="segment-name-input"\n  label={t("segments-page.create.label-segment-name")}\n  ...\n/>\n\n<Button data-testid="segment-save-btn" onClick={handleSave}>Сохранить</Button>'}]},
    {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Acceptance: each element above carries a data-testid attribute in the rendered DOM. Playwright tests will switch from text-based selectors to data-testid in a follow-up.'}]},
]}

payload = {'fields': {
    'project': {'key': 'CDP'},
    'issuetype': {'name': 'Task'},
    'summary': '[QA] BUG-115: Add data-testid attributes to critical FE elements (segment builder, campaign, lists)',
    'labels': ['qa-suite-2026-06-02', 'bug-115', 'Frontend', 'testability'],
    'priority': {'name': 'High'},
    'components': [{'id': '10139'}],
    'assignee': {'accountId': '6194df82744c4d0069525e83'},
    'description': adf,
}}

req = urllib.request.Request(
    'https://ssduz.atlassian.net/rest/api/3/issue',
    data=json.dumps(payload).encode(),
    headers={'Authorization': AUTH, 'Content-Type': 'application/json', 'Accept': 'application/json'},
    method='POST',
)
try:
    r = urllib.request.urlopen(req)
    j = json.loads(r.read())
    print(f'BUG-115 -> {j["key"]}')
    mapping = json.load(open('reports/jira-mapping.json'))
    mapping['BUG-115'] = j['key']
    json.dump(mapping, open('reports/jira-mapping.json', 'w'), indent=2)
except urllib.error.HTTPError as e:
    print('FAIL', e.code, e.read()[:400])
