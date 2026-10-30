// Confirm destructive actions; auto-save status selects.
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (e) => {
    if (!window.confirm(form.dataset.confirm)) e.preventDefault();
  });
});
document.querySelectorAll('select[data-autosubmit]').forEach((sel) => {
  sel.addEventListener('change', () => sel.form.submit());
});
