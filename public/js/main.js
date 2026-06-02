$(function () {
    var searchItems = [];

    function setTheme(mode) {
        document.documentElement.setAttribute('data-theme', mode);
        localStorage.setItem('site-theme', mode);
        $('.theme-icon')
            .toggleClass('fa-moon', mode !== 'dark')
            .toggleClass('fa-sun', mode === 'dark');
    }

    function initTheme() {
        var saved = localStorage.getItem('site-theme');
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(saved || (prefersDark ? 'dark' : 'light'));
    }

    function readSearchIndex() {
        var node = document.getElementById('site-search-index');
        if (!node) return;
        try {
            searchItems = JSON.parse(node.textContent || '[]');
        } catch (error) {
            searchItems = [];
        }
    }

    function highlightTerm(text, terms) {
        var safeText = $('<div>').text(text || '').html();
        if (!terms || !terms.length) return safeText;
        terms.forEach(function(term) {
            var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            safeText = safeText.replace(new RegExp('(' + escaped + ')', 'ig'), '<mark>$1</mark>');
        });
        return safeText;
    }

    function makeSnippet(text, terms) {
        var source = (text || '').replace(/\s+/g, ' ').trim();
        if (!source) return '';
        var lower = source.toLowerCase();
        var index = -1;
        terms.some(function(term) {
            index = lower.indexOf(term);
            return index !== -1;
        });
        if (index === -1) return source.slice(0, 180);
        var start = Math.max(0, index - 70);
        var end = Math.min(source.length, index + 150);
        return (start > 0 ? '...' : '') + source.slice(start, end) + (end < source.length ? '...' : '');
    }

    function searchSite(query) {
        var terms = $.trim(query).toLowerCase().split(/\s+/).filter(Boolean);
        var $results = $('.search-results');
        if (!terms.length) {
            $results.html('<div class="search-empty">Type a keyword to search the site.</div>');
            return;
        }

        var matches = searchItems
            .map(function(item) {
                var title = (item.title || '').toLowerCase();
                var body = (item.text || '').toLowerCase();
                var meta = [item.type, item.date].join(' ').toLowerCase();
                var haystack = [title, body, meta].join(' ');
                var score = 0;
                terms.forEach(function(term) {
                    if (title.indexOf(term) !== -1) score += 6;
                    if (body.indexOf(term) !== -1) score += 2;
                    if (meta.indexOf(term) !== -1) score += 1;
                });
                if (terms.every(function(term) { return haystack.indexOf(term) !== -1; })) score += 3;
                return $.extend({}, item, { score: score });
            })
            .filter(function(item) { return item.score > 0; })
            .sort(function(a, b) { return b.score - a.score; })
            .slice(0, 12);

        if (!matches.length) {
            $results.html('<div class="search-empty">No results found.</div>');
            return;
        }

        $results.html(matches.map(function(item) {
            var snippet = makeSnippet(item.text, terms);
            return [
                '<a class="search-result" href="' + item.url + '">',
                    '<span class="search-type">' + item.type + (item.date ? ' / ' + item.date : '') + '</span>',
                    '<strong>' + highlightTerm(item.title, terms) + '</strong>',
                    '<p>' + highlightTerm(snippet, terms) + '</p>',
                '</a>'
            ].join('');
        }).join(''));
    }

    function openSearch() {
        $('.search-panel').addClass('is-open').attr('aria-hidden', 'false');
        setTimeout(function() {
            $('#site-search-input').trigger('focus');
        }, 80);
    }

    function closeSearch() {
        $('.search-panel').removeClass('is-open').attr('aria-hidden', 'true');
    }

    function revealPage() {
        $('.page, .side-card').removeClass('content-ready');
        setTimeout(function() {
            $('.page, .side-card').addClass('content-ready');
            initMotion();
        }, 40);
    }

    function initMotion() {
        var cards = document.querySelectorAll('.article-card, .project-card, .section-head');
        cards.forEach(function(card) {
            card.classList.add('motion-watch');
        });

        if (!('IntersectionObserver' in window)) {
            cards.forEach(function(card) {
                card.classList.add('is-visible');
            });
            return;
        }

        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.14 });

        cards.forEach(function(card) {
            if (!card.classList.contains('is-visible')) observer.observe(card);
        });
    }

    $(document).on('mousemove', '.article-card, .project-card', function(e) {
        var rect = this.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        this.style.setProperty('--mouse-x', x + '%');
        this.style.setProperty('--mouse-y', y + '%');
    });

    initTheme();
    readSearchIndex();
    revealPage();

    $('.theme-toggle').click(function() {
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    $('.search-toggle').click(openSearch);
    $('.search-close').click(closeSearch);
    $('#site-search-input').on('input', function() {
        searchSite(this.value);
    });
    $('.search-panel').click(function(e) {
        if ($(e.target).is('.search-panel')) closeSearch();
    });
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape') closeSearch();
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openSearch();
        }
    });
    $(document).on('click', '.search-result', closeSearch);

    $(document).on('mouseenter', '.has-submenu', function() {
        clearTimeout(this._submenuTimer);
        $(this).addClass('submenu-open');
    });
    $(document).on('mouseleave', '.has-submenu', function() {
        var item = this;
        item._submenuTimer = setTimeout(function() {
            $(item).removeClass('submenu-open');
        }, 120);
    });

    // resize window
    $(window).resize(function () {
        if ($(window).width() < 1280 && $(window).width()>540) {
            $(".page").css({"width": $(window).width() - $(".side-card").width() - 90, "float": "left"})
        } else {
            $(".page").removeAttr("style")
        }
    });

    // menu
    $(".menus_icon").click(function () {
        if ($(".header_wrap").hasClass("menus-open")) {
            $(".header_wrap").removeClass("menus-open").addClass("menus-close")
        } else {
            $(".header_wrap").removeClass("menus-close").addClass("menus-open")
        }
    })

    $(".m-social-links").click(function () {
        if ($(".author-links").hasClass("is-open")) {
            $(".author-links").removeClass("is-open").addClass("is-close")
        } else {
            $(".author-links").removeClass("is-close").addClass("is-open")
        }
    })

    $(".site-nav").click(function () {
        if ($(".nav").hasClass("nav-open")) {
            $(".nav").removeClass("nav-open").addClass("nav-close")
        } else {
            $(".nav").removeClass("nav-close").addClass("nav-open")
        }
    })

    $(document).click(function(e){
        var target = $(e.target);
        if(target.closest(".nav").length != 0) return;
        $(".nav").removeClass("nav-open").addClass("nav-close")
        if(target.closest(".author-links").length != 0) return;
        $(".author-links").removeClass("is-open").addClass("is-close")
        if((target.closest(".menus_icon").length != 0) || (target.closest(".menus_items").length != 0)) return;
        $(".header_wrap").removeClass("menus-open").addClass("menus-close")
    })

    // 显示 cdtop
    $(document).ready(function ($) {
        var offset = 100,
            scroll_top_duration = 700,
            $back_to_top = $('.nav-wrap');

        $(window).scroll(function () {
            ($(this).scrollTop() > offset) ? $back_to_top.addClass('is-visible') : $back_to_top.removeClass('is-visible');
        });

        $(".cd-top").on('click', function (event) {
            event.preventDefault();
            $('body,html').animate({
                scrollTop: 0,
            }, scroll_top_duration);
        });
    });

    // ========== 文章卡片初始化函数 ==========
    function initArticleCards() {
        var container = document.getElementById('article-grid-container');
        if (!container) return;
        
        // 如果已经排序过，先移除标记（允许 PJAX 后重新排序）
        var cards = Array.from(container.children);
        if (cards.length === 0) return;
        
        // 按时间排序（最新在前）
        cards.sort(function(a, b) {
            return new Date(b.dataset.time) - new Date(a.dataset.time);
        });
        
        cards.forEach(function(card) {
            container.appendChild(card);
        });
    }

    // pjax
    $(document).pjax('a[target!=_blank]','.page', {
        fragment: '.page',
        timeout: 5000
    });
    $(document).on({
        'pjax:click': function() {
            $('body,html').animate({
                scrollTop: 0,
            }, 700);
        },
        'pjax:end': function() {
            if ($(".header_wrap").hasClass("menus-open")) {
                $(".header_wrap").removeClass("menus-open").addClass("menus-close")
            }
            if ($(".author-links").hasClass("is-open")) {
                $(".author-links").removeClass("is-open").addClass("is-close")
            }
            if ($(".nav").hasClass("nav-open")) {
                $(".nav").removeClass("nav-open").addClass("nav-close")
            }
            
            // ========== PJAX 加载完成后初始化卡片 ==========
            setTimeout(initArticleCards, 100);
            revealPage();
        }
    });

    // smooth scroll
    $(function () {
        $('a[href*=\\#]:not([href=\\#])').click(function () {
            if (location.pathname.replace(/^\//, '') == this.pathname.replace(/^\//, '') && location.hostname == this.hostname) {
                var target = $(this.hash);
                target = target.length ? target : $('[name=' + this.hash.slice(1) + ']');
                if (target.length) {
                    $('html,body').animate({
                        scrollTop: target.offset().top
                    }, 700);
                    return false;
                }
            }
        });
    });

    // ========== 页面首次加载时初始化卡片 ==========
    initArticleCards();

})
