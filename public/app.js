// ── Teaser flow ───────────────────────────────────────────────────────────────
// Called when user selects a file via the hidden #file-input
// Runs triage → shows teaser section with result

async function handleFile(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  if (file.size > 10 * 1024 * 1024) {
    showTeaserError('Bestand te groot. Maximaal 10 MB.');
    return;
  }

  const teaser = document.getElementById('teaser');
  const teaserCompany = document.getElementById('teaser-company');
  const teaserFound = document.getElementById('teaser-found');
  const teaserSub = document.getElementById('teaser-sub');
  const teaserLocked = document.getElementById('teaser-locked-text');
  const modalCopy = document.getElementById('modal-dynamic-copy');

  // Show teaser in loading state
  teaser.style.display = 'block';
  teaser.classList.remove('teaser--visible');
  teaserCompany.textContent = 'Analyseren...';
  teaserFound.textContent = '⏳ Even geduld...';
  teaserSub.textContent = 'Jouw document wordt geanalyseerd.';

  setTimeout(() => teaser.classList.add('teaser--visible'), 10);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${WORKER_URL}/analyze`, { method: 'POST', body: formData });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || 'Analyse mislukt');

    // Fill in triage results
    const airline = data.airline || data.company || null;
    const risk = data.risk || 'medium';
    const claimAmount = data.claim_amount || null;
    const disruptionType = data.disruption_type || data.contract_type || null;

    const riskLabel = { low: '🟡 Laag', medium: '🟠 Middel', high: '🟢 Hoog' }[risk] || risk;

    teaserCompany.textContent = airline || 'Document herkend';
    teaserFound.textContent = 'Eerste bevinding:';

    let subText = 'Jouw vluchtdocument is geanalyseerd.';
    if (claimAmount) subText += ` Mogelijk compensatiebedrag: €${claimAmount}.`;
    if (disruptionType) subText += ` Type verstoring: ${disruptionType}.`;
    subText += ' Kans op succes: ' + riskLabel + '.';
    teaserSub.textContent = subText;

    if (teaserLocked) {
      teaserLocked.innerHTML = `<strong>Volledige analyse na betaling</strong>
        Claim-kansen, inschatting en kant-en-klare claimbrief — uiterlijk morgen 16:00 per e-mail.`;
    }

    if (modalCopy) {
      modalCopy.textContent = airline
        ? `We hebben jouw vlucht bij ${airline} herkend. De volledige beoordeling volgt na betaling.`
        : 'We hebben eerste aanwijzingen herkend. De volledige beoordeling volgt na betaling.';
    }

  } catch (err) {
    teaserCompany.textContent = 'Document herkend';
    teaserFound.textContent = 'Klaar om te analyseren:';
    teaserSub.textContent = 'Klik hieronder om jouw volledige analyse en claimbrief aan te vragen.';
    console.warn('Triage fout:', err.message);
  }

  // Scroll to teaser
  teaser.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showTeaserError(msg) {
  const teaser = document.getElementById('teaser');
  if (teaser) {
    teaser.style.display = 'block';
    const sub = document.getElementById('teaser-sub');
    if (sub) sub.textContent = msg;
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal() {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.classList.add('modal--open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) {
    modal.classList.remove('modal--open');
    document.body.style.overflow = '';
  }
}

function closeModalOutside(event) {
  if (event.target === document.getElementById('modal')) {
    closeModal();
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ── FAQ accordion ─────────────────────────────────────────────────────────────

function toggleFaq(el) {
  const item = el.closest('.faq-item');
  const answer = item.querySelector('.faq-a');
  const chevron = item.querySelector('.faq-chevron');
  const isOpen = item.classList.contains('faq-item--open');

  // Close all others
  document.querySelectorAll('.faq-item--open').forEach(openItem => {
    openItem.classList.remove('faq-item--open');
    const a = openItem.querySelector('.faq-a');
    const c = openItem.querySelector('.faq-chevron');
    if (a) a.style.maxHeight = null;
    if (c) c.style.transform = '';
  });

  if (!isOpen) {
    item.classList.add('faq-item--open');
    if (answer) answer.style.maxHeight = answer.scrollHeight + 'px';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  }
}

// ── Sticky footer ─────────────────────────────────────────────────────────────

(function initStickyFooter() {
  const stickyFooter = document.getElementById('sticky-footer');
  if (!stickyFooter) return;

  let lastScrollY = window.scrollY;
  let ticking = false;

  function updateSticky() {
    const scrollY = window.scrollY;
    const docHeight = document.documentElement.scrollHeight;
    const windowHeight = window.innerHeight;
    const nearBottom = scrollY + windowHeight > docHeight - 200;

    if (scrollY > 400 && !nearBottom) {
      stickyFooter.classList.add('sticky-footer--visible');
    } else {
      stickyFooter.classList.remove('sticky-footer--visible');
    }

    lastScrollY = scrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateSticky);
      ticking = true;
    }
  }, { passive: true });
})();

