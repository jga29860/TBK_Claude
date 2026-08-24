// ============================================================
// TBK — Documentation fonctionnelle (consultation, admin uniquement)
// ============================================================

async function initPage() {
  const access = await getCurrentAccess();
  const deniedPanel = document.getElementById('deniedPanel');
  const docContent = document.getElementById('docContent');

  const hasAccess = !!access && access.pages.includes('documentation');

  if (!hasAccess) {
    deniedPanel.hidden = false;
    docContent.hidden = true;
    return;
  }

  deniedPanel.hidden = true;
  docContent.hidden = false;
}

document.addEventListener('DOMContentLoaded', initPage);
