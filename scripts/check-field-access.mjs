const target = 'https://field.fugetti.com';
const timeoutMs = 15000;

function cleanSnippet(value) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function hasAccessChallenge(text, headers, url) {
  const haystack = [
    text,
    url,
    headers.get('cf-access-domain') ?? '',
    headers.get('cf-access-authenticated-user-email') ?? '',
    headers.get('location') ?? '',
  ].join(' ');

  return /cloudflare access|zero trust|one-time pin|one time pin|cf_access|cdn-cgi\/access|identity challenge|sign in with cloudflare/i.test(
    haystack,
  );
}

function looksLikeUnitFlipApp(text, contentType) {
  if (!/text\/html/i.test(contentType)) {
    return false;
  }

  return /<div[^>]+id=["']root["']|\/assets\/index-|UnitFlip|unitflip-inventory|vite/i.test(text);
}

async function main() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'UnitFlip-field-access-check/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    const server = response.headers.get('server') ?? '';
    const finalUrl = response.url;
    const body = await response.text();
    const snippet = cleanSnippet(body);
    const challengeDetected = hasAccessChallenge(body, response.headers, finalUrl);
    const publicAppDetected = response.ok && looksLikeUnitFlipApp(body, contentType) && !challengeDetected;

    console.log(`target=${target}`);
    console.log(`status=${response.status}`);
    console.log(`final_url=${finalUrl}`);
    console.log(`content_type=${contentType || 'unknown'}`);
    console.log(`server=${server || 'unknown'}`);
    console.log(`body_snippet=${snippet || '(empty)'}`);

    if (challengeDetected) {
      console.log('result=PASS_LIKELY_PROTECTED');
      console.log('reason=An unauthenticated request appears to receive an identity challenge before the app loads.');
      return;
    }

    if (publicAppDetected) {
      console.log('result=FAIL_PUBLIC_APP_HTML');
      console.log('reason=An unauthenticated request returned what looks like the UnitFlip app shell.');
      return;
    }

    console.log('result=UNKNOWN_MANUAL_REVIEW_REQUIRED');
    console.log('reason=The response was not clearly an Access challenge or a public UnitFlip app shell.');
  } catch (error) {
    console.log(`target=${target}`);
    console.log('result=UNKNOWN_MANUAL_REVIEW_REQUIRED');
    console.log(`reason=Request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

await main();
