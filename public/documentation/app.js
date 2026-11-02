const side = document.querySelector('.side');
document.querySelector('.menu-btn')?.addEventListener('click', () => side.classList.toggle('open'));
side?.addEventListener('click', (event) => {
  if (event.target.closest('a')) side.classList.remove('open');
});

const search = document.querySelector('.search');
search?.addEventListener('input', () => {
  const q = search.value.trim().toLowerCase();
  document.querySelectorAll('main section, main .hero').forEach((block) => {
    block.hidden = q.length > 1 && !block.textContent.toLowerCase().includes(q);
  });
});

document.querySelectorAll('.shot img').forEach((img) => {
  function miss() {
    img.closest('.shot')?.classList.add('missing');
  }
  img.addEventListener('error', miss);
  if (img.complete && img.naturalWidth === 0) miss();
});

const links = [...document.querySelectorAll('.side a')];
const sections = links
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
function mark() {
  let current = sections[0];
  sections.forEach((section) => {
    if (section.getBoundingClientRect().top < 120) current = section;
  });
  links.forEach((link) => link.classList.toggle('on', link.getAttribute('href') === `#${current?.id}`));
}
document.addEventListener('scroll', mark, { passive: true });
mark();
