/**
 * 2027 GS25 상품전략공유회 — 본부 로그인 이메일 인증 릴레이
 *
 * 역할
 *   플랫폼(Next.js / Cloud Functions)이 생성한 6자리 인증번호를 받아
 *   **@gsretail.com 이메일로만** 발송한다.
 *
 * 보안 원칙
 *   1) 인증번호의 해시·만료·시도횟수는 **플랫폼이 관리**한다.
 *      이 스크립트는 메일 릴레이일 뿐이며 인증번호를 저장하지 않는다.
 *   2) 웹앱은 "모든 사용자(익명)"로 배포되므로 공유키(SHARED_KEY)로 호출자를 검증한다.
 *   3) 도메인 화이트리스트를 **여기서도 다시 검사**한다(플랫폼 우회 방지).
 *   4) 발송 이력은 이메일을 마스킹해 기록하고, 인증번호는 절대 기록하지 않는다.
 *
 * 최초 설정
 *   1. 이 파일 전체를 Apps Script 프로젝트의 Code.gs 에 붙여넣는다.
 *   2. 편집기에서 setup 함수를 한 번 실행한다(권한 승인 필요).
 *      → Staff / MailLogs 시트가 생성되고 SHARED_KEY 가 발급되어 로그에 출력된다.
 *   3. 배포 → 새 배포 → 유형 "웹 앱"
 *        - 실행 사용자: 나
 *        - 액세스 권한: 모든 사용자
 *      → 발급된 /exec URL 과 SHARED_KEY 를 플랫폼 환경변수에 넣는다.
 *         APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
 *         APPS_SCRIPT_KEY=<setup 이 출력한 키>
 */

// ── 설정 ─────────────────────────────────────────────────────────
/** 본부 계정 원장 스프레드시트 ID */
var SHEET_ID = '1FhWFERnQyGk1gGIXW12iR1nw8uf9eEHcIV5zsVVKbVw';

/** 이 도메인 이메일에만 발송한다. 요구사항: @gsretail.com 전용 */
var ALLOWED_DOMAIN = 'gsretail.com';

var STAFF_SHEET = 'Staff';
var LOG_SHEET = 'MailLogs';

var STAFF_HEADERS = ['email', 'name', 'team', 'role', 'sectionIds', 'backupFor', 'active'];
var LOG_HEADERS = ['at', 'emailMasked', 'purpose', 'status', 'detail', 'callerIp'];

/** 동일 이메일 10분 5회 — 스크립트 자체 방어선 (플랫폼에도 별도 제한이 있다) */
var RATE_LIMIT_COUNT = 5;
var RATE_LIMIT_WINDOW_SEC = 600;

// ── 진입점 ───────────────────────────────────────────────────────

function doGet() {
  return json_({ ok: true, service: 'gs25-expo-2027-mailer', version: 1 });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'invalid-json' });
  }

  if (!verifyKey_(body.sharedKey)) {
    log_('', body.action || '?', 'unauthorized', 'shared key mismatch', body.ip || '');
    return json_({ ok: false, error: 'unauthorized' });
  }

  try {
    switch (body.action) {
      case 'ping':
        return json_({ ok: true, pong: true, allowedDomain: ALLOWED_DOMAIN });
      case 'sendOtp':
        return json_(sendOtp_(body));
      case 'listStaff':
        return json_({ ok: true, staff: listStaff_() });
      default:
        return json_({ ok: false, error: 'unknown-action' });
    }
  } catch (err) {
    log_('', body.action || '?', 'error', String(err), body.ip || '');
    return json_({ ok: false, error: 'internal', detail: String(err) });
  }
}

// ── 인증번호 메일 발송 ───────────────────────────────────────────

/**
 * @param {{email:string, code:string, expiresInSec:number, purpose?:string, ip?:string}} p
 */
function sendOtp_(p) {
  var email = String(p.email || '').trim().toLowerCase();
  var code = String(p.code || '').trim();
  var expiresInSec = Number(p.expiresInSec || 180);
  var purpose = String(p.purpose || 'STAFF_LOGIN');

  // 1) 형식 · 도메인 검사 — 요구사항의 핵심
  if (!isAllowedEmail_(email)) {
    log_(email, purpose, 'rejected', 'domain not allowed', p.ip || '');
    return { ok: false, error: 'domain-not-allowed' };
  }
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: 'invalid-code-format' };
  }

  // 2) 스크립트 자체 rate limit
  if (!consumeRate_(email)) {
    log_(email, purpose, 'rate-limited', '', p.ip || '');
    return { ok: false, error: 'rate-limited' };
  }

  // 3) 본부 계정 원장 확인 (Staff 시트에 없거나 비활성이면 거부)
  var staff = findStaff_(email);
  if (!staff) {
    log_(email, purpose, 'rejected', 'not in Staff sheet', p.ip || '');
    return { ok: false, error: 'not-registered' };
  }
  if (!staff.active) {
    log_(email, purpose, 'rejected', 'inactive account', p.ip || '');
    return { ok: false, error: 'inactive' };
  }

  // 4) 발송
  var minutes = Math.max(1, Math.round(expiresInSec / 60));
  MailApp.sendEmail({
    to: email,
    subject: '[GS25 상품전략공유회] 본부 로그인 인증번호 ' + code,
    htmlBody: buildHtml_(staff.name || email, code, minutes),
    body: buildText_(staff.name || email, code, minutes),
    name: 'GS25 상품전략공유회',
    noReply: true,
  });

  log_(email, purpose, 'sent', staff.role || '', p.ip || '');

  return {
    ok: true,
    maskedEmail: maskEmail_(email),
    name: staff.name || '',
    role: staff.role || 'md',
    team: staff.team || '',
    sectionIds: staff.sectionIds,
    backupFor: staff.backupFor,
    remainingQuota: MailApp.getRemainingDailyQuota(),
  };
}

function buildHtml_(name, code, minutes) {
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',\'Malgun Gothic\',sans-serif;',
    'max-width:520px;margin:0 auto;padding:32px 24px;color:#0f223e">',
    '<div style="font-size:13px;font-weight:700;letter-spacing:.08em;color:#0096a2">2027</div>',
    '<h1 style="margin:4px 0 24px;font-size:22px;line-height:1.35">GS25 상품전략공유회<br>본부 로그인 인증번호</h1>',
    '<p style="font-size:15px;line-height:1.7;color:#62748d;margin:0 0 20px">',
    escapeHtml_(name) + '님, 아래 인증번호를 로그인 화면에 입력해 주세요.</p>',
    '<div style="background:#e8f2ff;border-radius:16px;padding:24px;text-align:center;margin:0 0 20px">',
    '<div style="font-size:38px;font-weight:800;letter-spacing:.32em;color:#0056b3">' + code + '</div>',
    '<div style="margin-top:8px;font-size:13px;color:#62748d">' + minutes + '분 안에 입력해 주세요</div>',
    '</div>',
    '<p style="font-size:13px;line-height:1.7;color:#62748d;margin:0 0 6px">',
    '본인이 요청하지 않은 메일이라면 <b>절대 인증번호를 입력하지 마시고</b> 정보보호 담당자에게 알려 주세요.</p>',
    '<p style="font-size:13px;line-height:1.7;color:#62748d;margin:0">',
    '인증번호는 타인과 공유하지 마세요. 본부 직원은 인증번호를 묻지 않습니다.</p>',
    '<hr style="border:none;border-top:1px solid #e0e7f0;margin:24px 0 12px">',
    '<p style="font-size:12px;color:#98a8bd;margin:0">본 메일은 발신 전용입니다. · GS리테일 상품기획부문</p>',
    '</div>',
  ].join('');
}

function buildText_(name, code, minutes) {
  return (
    name +
    '님,\n\n[GS25 상품전략공유회] 본부 로그인 인증번호\n\n' +
    code +
    '\n\n' +
    minutes +
    '분 안에 입력해 주세요.\n\n' +
    '본인이 요청하지 않은 메일이라면 인증번호를 입력하지 마시고 정보보호 담당자에게 알려 주세요.\n' +
    '본 메일은 발신 전용입니다. · GS리테일 상품기획부문'
  );
}

// ── Staff 시트 ───────────────────────────────────────────────────

function listStaff_() {
  var rows = readSheet_(STAFF_SHEET, STAFF_HEADERS);
  return rows
    .filter(function (r) {
      return isAllowedEmail_(r.email);
    })
    .map(function (r) {
      return {
        email: r.email,
        name: r.name,
        team: r.team,
        role: normalizeRole_(r.role),
        sectionIds: splitList_(r.sectionIds),
        backupFor: splitList_(r.backupFor),
        active: isTrue_(r.active),
      };
    });
}

function findStaff_(email) {
  var all = listStaff_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].email === email) return all[i];
  }
  return null;
}

function normalizeRole_(v) {
  var r = String(v || '').trim().toLowerCase();
  return r === 'admin' || r === 'operator' || r === 'md' ? r : 'md';
}

function splitList_(v) {
  return String(v || '')
    .split(/[,|]/)
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s.length > 0;
    });
}

function isTrue_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'Y' || s === 'TRUE' || s === '1' || s === 'O' || s === '활성';
}

// ── 유틸 ─────────────────────────────────────────────────────────

function isAllowedEmail_(email) {
  var e = String(email || '').trim().toLowerCase();
  // 로컬파트에 공백·@ 가 없고, 도메인이 정확히 ALLOWED_DOMAIN 인 경우만
  var re = new RegExp('^[a-z0-9._%+-]+@' + ALLOWED_DOMAIN.replace(/\./g, '\\.') + '$');
  return re.test(e);
}

function maskEmail_(email) {
  var parts = String(email).split('@');
  var local = parts[0] || '';
  var shown = local.slice(0, Math.min(2, local.length));
  return shown + '*'.repeat(Math.max(1, local.length - shown.length)) + '@' + (parts[1] || '');
}

/** 길이 노출을 줄인 상수시간 비교 */
function verifyKey_(given) {
  var expected = PropertiesService.getScriptProperties().getProperty('SHARED_KEY');
  if (!expected) return false;
  var a = String(given || '');
  var b = String(expected);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function consumeRate_(email) {
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + Utilities.base64EncodeWebSafe(email);
  var cur = Number(cache.get(key) || 0);
  if (cur >= RATE_LIMIT_COUNT) return false;
  cache.put(key, String(cur + 1), RATE_LIMIT_WINDOW_SEC);
  return true;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ss_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function readSheet_(name, headers) {
  var sh = ss_().getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0].map(function (h) {
    return String(h).trim();
  });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      var idx = head.indexOf(headers[c]);
      var val = idx >= 0 ? values[r][idx] : '';
      row[headers[c]] = typeof val === 'string' ? val.trim() : val;
      if (String(val).trim() !== '') empty = false;
    }
    if (!empty) {
      row.email = String(row.email || '').trim().toLowerCase();
      out.push(row);
    }
  }
  return out;
}

/** 인증번호는 절대 기록하지 않는다 */
function log_(email, purpose, status, detail, ip) {
  try {
    var sh = ss_().getSheetByName(LOG_SHEET);
    if (!sh) return;
    sh.appendRow([
      new Date(),
      email ? maskEmail_(email) : '',
      purpose,
      status,
      String(detail || '').slice(0, 200),
      String(ip || '').replace(/\.\d+$/, '.***'),
    ]);
  } catch (err) {
    // 로깅 실패가 발송을 막으면 안 된다
  }
}

// ── 최초 설정 / 점검 ─────────────────────────────────────────────

/** 편집기에서 한 번 실행: 시트 생성 + 공유키 발급 */
function setup() {
  var ss = ss_();

  var staff = ss.getSheetByName(STAFF_SHEET);
  if (!staff) {
    staff = ss.insertSheet(STAFF_SHEET);
    staff.appendRow(STAFF_HEADERS);
    staff.appendRow([
      'admin@gsretail.com',
      '본부 관리자',
      '상품기획팀',
      'admin',
      'welcome,media,souvenir,exit',
      '',
      'Y',
    ]);
    staff.appendRow(['fresh.md@gsretail.com', '이신선', '신선식품팀', 'md', 'fresh', 'counter-ff', 'Y']);
    staff.appendRow(['op1@gsretail.com', '현장 운영자', '행사운영팀', 'operator', '', '', 'Y']);
    staff.setFrozenRows(1);
    staff.getRange(1, 1, 1, STAFF_HEADERS.length).setFontWeight('bold');
  }

  var logs = ss.getSheetByName(LOG_SHEET);
  if (!logs) {
    logs = ss.insertSheet(LOG_SHEET);
    logs.appendRow(LOG_HEADERS);
    logs.setFrozenRows(1);
    logs.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold');
  }

  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('SHARED_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SHARED_KEY', key);
  }

  Logger.log('───────────────────────────────────────────────');
  Logger.log('✅ 설정 완료');
  Logger.log('SHARED_KEY (플랫폼 APPS_SCRIPT_KEY 에 넣으세요):');
  Logger.log(key);
  Logger.log('허용 도메인: @' + ALLOWED_DOMAIN);
  Logger.log('등록된 본부 계정: ' + listStaff_().length + '개');
  Logger.log('오늘 남은 메일 발송 한도: ' + MailApp.getRemainingDailyQuota());
  Logger.log('───────────────────────────────────────────────');
  return key;
}

/** 공유키를 새로 발급한다(유출 시). 플랫폼 환경변수도 함께 교체해야 한다. */
function rotateSharedKey() {
  var key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('SHARED_KEY', key);
  Logger.log('새 SHARED_KEY: ' + key);
  return key;
}

/** 편집기에서 실행해 본인 계정으로 테스트 메일을 보내 본다 */
function testSend() {
  var me = Session.getActiveUser().getEmail();
  Logger.log('현재 계정: ' + me);
  if (!isAllowedEmail_(me)) {
    Logger.log('⚠️ 현재 계정이 @' + ALLOWED_DOMAIN + ' 이 아니라 실제 발송은 거부됩니다.');
    Logger.log('   Staff 시트에 등록된 @' + ALLOWED_DOMAIN + ' 주소로 테스트하세요.');
    return;
  }
  var res = sendOtp_({ email: me, code: '123456', expiresInSec: 180, purpose: 'TEST' });
  Logger.log(JSON.stringify(res));
}
