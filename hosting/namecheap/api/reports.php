<?php
/**
 * A private page for reading what testers sent.
 *
 * Reports are only useful if you actually read them, and SSH-ing into shared
 * hosting to tail a file is friction enough that you won't. This renders them
 * in a browser instead.
 *
 * **Set PLOOBIA_READ_KEY below before uploading.** Without a key this refuses
 * to run rather than publishing your testers' words at a guessable URL.
 *
 *   https://ploobia.com/api/reports.php?key=YOUR-KEY
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
const PLOOBIA_READ_KEY = 'change-me-before-uploading';
// ---------------------------------------------------------------------------

if (PLOOBIA_READ_KEY === 'change-me-before-uploading' || strlen(PLOOBIA_READ_KEY) < 12) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    exit("Set PLOOBIA_READ_KEY to something long and private in api/reports.php first.\n");
}
if (!hash_equals(PLOOBIA_READ_KEY, (string) ($_GET['key'] ?? ''))) {
    // Same response for a missing and a wrong key: no hints.
    http_response_code(404);
    exit;
}

$dir  = dirname($_SERVER['DOCUMENT_ROOT']) . '/ploobia-data';
$file = $dir . '/reports.jsonl';

/*
 * Storage self-check. The one failure worth surfacing here is a store the
 * PHP user cannot write to — feedback.php then returns 503 and the app quietly
 * falls back to clipboard-and-email, which looks like "nobody is sending
 * anything" rather than like a permissions problem. This page is key-protected,
 * so it is the right place to say the awkward part out loud, path and all.
 */
$storeOk = is_dir($dir) ? is_writable($dir) : is_writable(dirname($dir));
$storeNote = is_dir($dir)
    ? ($storeOk ? 'writable' : 'NOT WRITABLE — feedback.php will return 503 and reports will fall back to email')
    : ($storeOk ? 'not created yet — the first report will make it' : 'cannot be created here — check the path and permissions');

$rows = [];
if (is_file($file)) {
    foreach (array_reverse(file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []) as $line) {
        $r = json_decode($line, true);
        if (is_array($r)) $rows[] = $r;
    }
}

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
$e = fn($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$mood = ['loved' => '🤩 liked it', 'confused' => '🤔 didn’t get it', 'broken' => '💥 broke'];
?><!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Ploobia — tester reports</title>
<style>
  body{margin:0;padding:1.5rem;background:#17130F;color:#E9E1CF;
    font:600 15px/1.6 Nunito,system-ui,-apple-system,"Segoe UI",sans-serif}
  h1{font-size:1.2rem;font-weight:900;color:#FBF5EA;margin:0 0 .2rem}
  .sub{opacity:.55;font-size:.85rem;margin-bottom:1.4rem}
  .r{border:1px solid rgba(255,255,255,.12);border-radius:1rem;padding:1rem 1.1rem;margin-bottom:.9rem;
    background:rgba(255,255,255,.03)}
  .hd{display:flex;flex-wrap:wrap;gap:.5rem;align-items:baseline;margin-bottom:.5rem}
  .mood{font-weight:900;color:#F5D28C}
  .cab{font-weight:800}
  .when{opacity:.45;font-size:.78rem;margin-left:auto}
  .note{font-size:1rem;color:#FBF5EA;white-space:pre-wrap;margin:.3rem 0 .7rem}
  .meta{font:500 11.5px/1.6 ui-monospace,Menlo,monospace;opacity:.6;word-break:break-word}
  .err{color:#F2A9A4;white-space:pre-wrap}
  .none{opacity:.5;padding:2rem 0}
  .store{font:500 11.5px/1.5 ui-monospace,Menlo,monospace;opacity:.5;margin:-1rem 0 1.4rem}
  .store.bad{opacity:1;color:#F2A9A4}
  .store code{opacity:.8}
</style>
<h1>Tester reports</h1>
<div class="sub"><?= count($rows) ?> report<?= count($rows) === 1 ? '' : 's' ?>, newest first</div>
<div class="store<?= $storeOk ? '' : ' bad' ?>">store <code><?= $e($dir) ?></code> — <?= $e($storeNote) ?></div>
<?php if (!$rows): ?>
  <p class="none">Nothing yet. Reports arrive when someone uses the “Tell us” tab in the arcade.</p>
<?php endif; ?>
<?php foreach ($rows as $r): $d = $r['device'] ?? []; $p = $r['perf'] ?? null; ?>
<div class="r">
  <div class="hd">
    <span class="mood"><?= $e($mood[$r['mood'] ?? ''] ?? ($r['mood'] ?? '?')) ?></span>
    <span class="cab"><?= $e($r['cabinet'] ?? '?') ?></span>
    <span style="opacity:.5">· <?= $e($r['band'] ?? '?') ?></span>
    <span class="when"><?= $e(date('D j M, H:i', (int) (($r['at'] ?? 0) / 1000))) ?></span>
  </div>
  <div class="note"><?= $e($r['note'] ?? '') ?></div>
  <div class="meta">
    build <?= $e($r['build'] ?? '?') ?> · <?= $e($r['route'] ?? '') ?><?= isset($r['country']) ? ' · ' . $e($r['country']) : '' ?><br>
    <?= $e($d['ua'] ?? 'unknown device') ?><br>
    <?= $e($d['viewport'] ?? '?') ?> @<?= $e($d['dpr'] ?? '?') ?> · <?= $e(($d['touch'] ?? false) ? 'touch' : 'pointer') ?>
    · gpu <?= $e($d['renderer'] ?? '—') ?> · <?= $e($d['fps'] ?? '—') ?> fps
    · storage <?= ($d['storage'] ?? false) ? 'on' : 'OFF' ?>
    <?php if ($p): ?><br>scene <?= $e($p['tier'] ?? '?') ?> · <?= $e($p['calls'] ?? '?') ?> draw calls ·
      <?= $e(number_format((int) ($p['triangles'] ?? 0))) ?> tris · median <?= $e($p['frameMs'] ?? '?') ?> ms,
      worst <?= $e($p['worstMs'] ?? '?') ?> ms<?php endif; ?>
    <?php if (!empty($r['errors'])): ?>
      <div class="err">errors:
<?php foreach ($r['errors'] as $err): ?>  [<?= $e($err['kind'] ?? '?') ?>] <?= $e($err['message'] ?? '') ?>
<?php endforeach; ?></div>
    <?php endif; ?>
  </div>
</div>
<?php endforeach; ?>
