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
