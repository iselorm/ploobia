<?php
/**
 * POST /api/feedback — where the in-app report tab sends a tester's report.
 *
 * The shared-hosting twin of functions/api/feedback.js. Same contract, same
 * refusal to pretend: if it cannot store a report it returns an error status so
 * the app falls back to clipboard + mailto, rather than a cheerful 200 over a
 * black hole.
 *
 * Deliberately dependency-free and database-free. Reports append to a
 * JSON-lines file ABOVE public_html, so no URL can reach it even if the
 * .htaccess rules are lost.
 *
 * Read them with:
 *   tail -n 5 ~/ploobia-data/reports.jsonl
 * or in cPanel's File Manager, or with the reader script beside this file.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Where reports live. One level above the web root by default — change only if
// you are certain the new location is not web-reachable.
// ---------------------------------------------------------------------------
$dir  = dirname($_SERVER['DOCUMENT_ROOT']) . '/ploobia-data';
$file = $dir . '/reports.jsonl';

const MAX_BYTES     = 32768;    // one report; anything larger is not a report
const MAX_FILE_SIZE = 5242880;  // 5 MB of reports is a very successful pilot
const MIN_SECONDS   = 2;        // simple flood guard, per IP

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');

function reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// A browser preflight only happens if the app is served from another origin.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: content-type');
    header('Access-Control-Max-Age: 86400');
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['error' => 'post reports here']);
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) === 0) {
    reply(400, ['error' => 'empty body']);
}
if (strlen($raw) > MAX_BYTES) {
    reply(413, ['error' => 'too large']);
}

$report = json_decode($raw, true);
if (!is_array($report)) {
    reply(400, ['error' => 'not json']);
}
if (!isset($report['note']) || !is_string($report['note']) || trim($report['note']) === '') {
    // Nothing is ever recorded unless a human actually wrote something.
    reply(400, ['error' => 'empty report']);
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
    reply(503, ['error' => 'no writable store']);
}
// If the host ignores the mkdir mode, say so rather than silently exposing it.
@chmod($dir, 0700);

if (is_file($file) && filesize($file) > MAX_FILE_SIZE) {
    reply(507, ['error' => 'report log full']);
}

// A crude per-IP throttle: enough to stop an accidental loop, not a security
// control. The IP is used for this and then discarded — it is not stored.
$stamp = $dir . '/.last-' . substr(hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '?'), 0, 16);
if (is_file($stamp) && (time() - (int) filemtime($stamp)) < MIN_SECONDS) {
    reply(429, ['error' => 'slow down']);
}
@touch($stamp);

// The country is worth adding server-side — it tells you whether a slow report
// came from a distant network. Nothing else about the request is recorded.
$report['receivedAt'] = round(microtime(true) * 1000);
$report['country']    = $_SERVER['HTTP_CF_IPCOUNTRY'] ?? ($_SERVER['GEOIP_COUNTRY_CODE'] ?? null);

$line = json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($line === false) {
    reply(400, ['error' => 'unencodable']);
}

// LOCK_EX so two testers pressing send at once cannot interleave a line.
$ok = @file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);
if ($ok === false) {
    reply(503, ['error' => 'could not write']);
}
@chmod($file, 0600);

reply(200, ['ok' => true]);
