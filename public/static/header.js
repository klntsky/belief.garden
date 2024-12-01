// Handle nav shadow on scroll
document.addEventListener('DOMContentLoaded', function() {
    const nav = document.querySelector('.nav-links');
    if (!nav) return;

    function updateNavShadow() {
        if (window.scrollY > 0) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', updateNavShadow);
    // Initial check
    updateNavShadow();
});
