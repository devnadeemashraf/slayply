/** Trimmed job pages used by the capture tests. They are shaped like real boards, not copies of them. */

export const GREENHOUSE_HTML = `<!doctype html>
<html><head>
<title>Senior Platform Engineer at Acme Robotics</title>
<meta property="og:site_name" content="Acme Robotics">
<meta property="og:title" content="Senior Platform Engineer">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Senior Platform Engineer",
 "hiringOrganization":{"@type":"Organization","name":"Acme Robotics"},
 "jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Berlin","addressCountry":"DE"}},
 "baseSalary":{"@type":"MonetaryAmount","currency":"EUR","value":{"@type":"QuantitativeValue","minValue":85000,"maxValue":110000,"unitText":"YEAR"}}}
</script>
<script>window.__tracking = "do not capture this";</script>
</head><body>
<nav>Home Jobs Sign in</nav>
<main>
<h1>Senior Platform Engineer</h1>
<p>We build the control plane for warehouse robots. You will own deploys, observability and on-call.</p>
<p>You bring five years of Kubernetes, Terraform and a habit of writing things down so the next person can run them. Our team is small, remote friendly and kind.</p>
</main>
<footer>Privacy Terms</footer>
</body></html>`;

export const LEVER_HTML = `<!doctype html>
<html><head>
<title>Northwind - Staff Data Engineer</title>
<meta property="og:site_name" content="Northwind">
</head><body>
<div class="posting">
<h2>Staff Data Engineer</h2>
<p>Location: Lisbon, Portugal (hybrid)</p>
<p>Compensation: €90,000 – €115,000 per year plus equity.</p>
<p>You will design the pipelines that feed our pricing models, review designs across three teams and mentor engineers who are new to streaming systems. We expect strong SQL and a calm approach to incidents.</p>
</div>
</body></html>`;

export const NO_STRUCTURE_HTML = `<!doctype html>
<html><head><title>Careers</title></head>
<body><div>Join us. We raised $5 million last year and love tacos.</div></body></html>`;

export const LINKEDIN_URL = "https://www.linkedin.com/jobs/view/123456789/";

/** Greenhouse-shaped application form: labels wrap or point at their fields; some fields must be skipped. */
export const GREENHOUSE_FORM_HTML = `<!doctype html>
<html><head><title>Apply</title></head><body>
<header><form role="search"><input type="text" name="q" aria-label="Search jobs"></form></header>
<main>
<form id="application_form">
  <div class="field"><label for="first_name">First Name <span>*</span></label><input id="first_name" type="text" value="Jane"></div>
  <div class="field"><label for="email">Email *</label><input id="email" type="email" value="jane@example.com"></div>
  <div class="field"><label for="resume">Resume/CV</label><input id="resume" type="file"></div>
  <div class="field"><label for="q1">Why do you want to work at Acme Robotics? *</label><textarea id="q1" maxlength="1200">My typed answer must never be read</textarea></div>
  <div class="field"><label for="q2">Describe a system you operated in production (max 500 characters)</label><textarea id="q2"></textarea></div>
  <div class="field"><label for="q3">LinkedIn Profile</label><input id="q3" type="text"></div>
  <div class="field"><label for="q4">Are you legally authorized to work in Germany? (required)</label>
    <select id="q4"><option>Yes</option><option>No</option></select></div>
  <div class="field" hidden><label for="q5">Hidden honeypot question about your favourite colour</label><input id="q5" type="text"></div>
  <div class="field"><label for="g">Gender</label><select id="g"><option>Prefer not to say</option></select></div>
  <input type="hidden" name="token" value="abc">
  <button type="submit">Submit</button>
</form>
</main></body></html>`;

/** Lever/Ashby-shaped: aria-labelledby, fieldset legend with radios, and a free-text input without a label element. */
export const ARIA_FORM_HTML = `<!doctype html>
<html><head><title>Apply</title></head><body><main>
<div id="lbl1">What is the most interesting problem you have solved recently?</div>
<textarea aria-labelledby="lbl1" required></textarea>
<fieldset><legend>Will you now or in the future require visa sponsorship?</legend>
  <label><input type="radio" name="visa" value="y"> Yes</label>
  <label><input type="radio" name="visa" value="n"> No</label></fieldset>
<input type="text" aria-label="What salary range are you expecting?">
<input type="text" placeholder="Anything else we should know?">
<label for="dupe">Why us?</label><textarea id="dupe"></textarea>
<label for="dupe2">Why us?</label><textarea id="dupe2"></textarea>
</main></body></html>`;
