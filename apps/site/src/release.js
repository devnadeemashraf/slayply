// Shows the newest GitHub release next to the download button. The page already works without it:
// the link below the button goes to the releases page.
const API = "https://api.github.com/repos/devnadeemashraf/slayply/releases/latest";
const TAG = /^v\d+\.\d+\.\d+$/;

const link = document.getElementById("release-link");
if (link) {
  fetch(API, { headers: { Accept: "application/vnd.github+json" } })
    .then((response) => (response.ok ? response.json() : null))
    .then((release) => {
      if (!release || typeof release.tag_name !== "string" || !TAG.test(release.tag_name)) return;
      link.textContent = `Latest release: ${release.tag_name}`;
      link.href = `https://github.com/devnadeemashraf/slayply/releases/tag/${release.tag_name}`;
    })
    .catch(() => {});
}
