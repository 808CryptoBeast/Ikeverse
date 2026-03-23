// Scroll animations and effects
document.addEventListener('DOMContentLoaded', function() {
    // Particle field for hero section
    const particleField = document.getElementById('particle-field');
    const particleCount = window.innerWidth < 768 ? 30 : 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'quantum-particle';
        
        // Random properties
        const size = Math.random() * 4 + 1;
        const duration = Math.random() * 20 + 10;
        const delay = Math.random() * 20;
        const opacity = Math.random() * 0.5 + 0.3;
        
        particle.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            opacity: ${opacity};
            animation-duration: ${duration}s;
            animation-delay: ${delay}s;
        `;
        
        particleField.appendChild(particle);
    }
    
    // Accordion functionality
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const item = this.parentElement;
            const isActive = item.classList.contains('active');
            
            // Close all items first
            document.querySelectorAll('.accordion-item').forEach(el => {
                el.classList.remove('active');
            });
            
            // Open current if wasn't active
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });
    
    // Scroll to sections
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const headerOffset = 100;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
});