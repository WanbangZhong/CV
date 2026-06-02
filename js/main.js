$(function () {
    var searchItems = [];
    var searchIndexLoaded = false;
    var searchIndexLoading = null;
    var searchBaseUrl = null;

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

    function loadSearchIndex() {
        if (searchIndexLoaded) return $.Deferred().resolve(searchItems).promise();
        if (searchIndexLoading) return searchIndexLoading;

        if (Array.isArray(window.__ONEOAK_SEARCH_INDEX__)) {
            searchItems = window.__ONEOAK_SEARCH_INDEX__;
            searchIndexLoaded = true;
            return $.Deferred().resolve(searchItems).promise();
        }

        var panel = document.querySelector('.search-panel');
        var indexUrl = panel && panel.getAttribute('data-search-index-url');

        if (!indexUrl) {
            searchIndexLoaded = true;
            searchItems = [];
            return $.Deferred().resolve(searchItems).promise();
        }

        $('.search-results').html('<div class="search-empty">Loading search index...</div>');
        searchIndexLoading = $.ajax({
            url: indexUrl,
            dataType: 'json',
            cache: false,
            timeout: 8000
        })
            .then(function(items) {
                searchItems = Array.isArray(items) ? items : [];
                searchIndexLoaded = true;
                return searchItems;
            }, function() {
                searchItems = [];
                searchIndexLoaded = true;
                $('.search-results').html('<div class="search-empty">Search index could not be loaded. Please rebuild the site.</div>');
                return searchItems;
            });

        return searchIndexLoading;
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

    function currentSearchQuery() {
        var input = document.getElementById('site-search-input');
        return input ? input.value : '';
    }

    function searchDataBaseUrl() {
        if (searchBaseUrl !== null) return searchBaseUrl;

        var scripts = document.getElementsByTagName('script');
        for (var index = 0; index < scripts.length; index += 1) {
            var src = scripts[index].getAttribute('src') || '';
            var cleanSrc = src.split('#')[0].split('?')[0];
            var markerIndex = cleanSrc.indexOf('js/search-data.js');
            if (markerIndex !== -1) {
                searchBaseUrl = cleanSrc.slice(0, markerIndex);
                return searchBaseUrl;
            }
        }

        var panel = document.querySelector('.search-panel');
        var indexUrl = panel && panel.getAttribute('data-search-index-url');
        if (indexUrl) {
            searchBaseUrl = indexUrl.replace(/search\.json(?:[?#].*)?$/, '');
            return searchBaseUrl;
        }

        searchBaseUrl = '';
        return searchBaseUrl;
    }

    function searchResultUrl(url) {
        var target = String(url || '');
        if (!target || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target) || target.charAt(0) === '#') return target;
        if (target.charAt(0) === '/') return target;
        return searchDataBaseUrl() + target.replace(/^\/+/, '');
    }

    function makeSnippet(text, terms) {
        var source = (text || '').replace(/\s+/g, ' ').trim();
        if (!source) return '';

        var lower = source.toLowerCase();
        var matchIndex = -1;
        terms.some(function(term) {
            matchIndex = lower.indexOf(term);
            return matchIndex !== -1;
        });

        if (matchIndex === -1) return source.slice(0, 150);

        var sentenceStart = source.lastIndexOf('.', matchIndex);
        var altStart = source.lastIndexOf('。', matchIndex);
        sentenceStart = Math.max(sentenceStart, altStart);
        var sentenceEnd = source.indexOf('.', matchIndex);
        var altEnd = source.indexOf('。', matchIndex);
        if (sentenceEnd === -1 || (altEnd !== -1 && altEnd < sentenceEnd)) sentenceEnd = altEnd;

        var start = sentenceStart === -1 ? Math.max(0, matchIndex - 55) : sentenceStart + 1;
        var end = sentenceEnd === -1 ? Math.min(source.length, matchIndex + 125) : sentenceEnd + 1;
        var snippet = source.slice(start, end).trim();

        if (snippet.length > 180) snippet = snippet.slice(0, 180).trim();
        return (start > 0 ? '...' : '') + snippet + (end < source.length ? '...' : '');
    }

    function renderSearchEmpty(message) {
        $('.search-results').html('<div class="search-empty">' + message + '</div>');
    }

    function searchSite(query) {
        var terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        var $results = $('.search-results');
        if (!terms.length) {
            renderSearchEmpty('Type a keyword to search the site.');
            return;
        }
        if (!searchIndexLoaded) {
            loadSearchIndex().then(function() {
                searchSite(currentSearchQuery());
            });
            return;
        }

        if (!searchItems.length) {
            renderSearchEmpty('Search index is empty. Please rebuild the site.');
            return;
        }

        var matches = searchItems
            .map(function(item) {
                var title = (item.title || '').toLowerCase();
                var body = (item.text || '').toLowerCase();
                var meta = [item.type, item.date].join(' ').toLowerCase();
                var haystack = [title, body, meta].join(' ');
                var isMatch = terms.every(function(term) {
                    return haystack.indexOf(term) !== -1;
                });
                var score = 0;
                terms.forEach(function(term) {
                    if (title.indexOf(term) !== -1) score += 6;
                    if (body.indexOf(term) !== -1) score += 2;
                    if (meta.indexOf(term) !== -1) score += 1;
                });
                if (isMatch) score += 3;
                return $.extend({}, item, {
                    isMatch: isMatch,
                    score: score
                });
            })
            .filter(function(item) { return item.isMatch; })
            .sort(function(a, b) { return b.score - a.score; });

        if (!matches.length) {
            renderSearchEmpty('No articles found for "' + $('<div>').text(query).html() + '".');
            return;
        }

        var resultList = matches.map(function(item) {
            var snippet = makeSnippet(item.text, terms);
            return [
                '<li>',
                    '<a class="search-result" href="' + searchResultUrl(item.url) + '">',
                        '<span class="search-type">' + item.type + (item.date ? ' / ' + item.date : '') + '</span>',
                        '<span class="search-result-title">' + highlightTerm(item.title, terms) + '</span>',
                        '<span class="search-result-snippet">' + highlightTerm(snippet, terms) + '</span>',
                    '</a>',
                '</li>'
            ].join('');
        }).join('');

        $results.html([
            '<div class="search-count">' + matches.length + (matches.length === 1 ? ' article' : ' articles') + ' found</div>',
            '<ul class="search-result-list">',
                resultList,
            '</ul>'
        ].join(''));
    }

    function refreshSearchResults() {
        searchSite(currentSearchQuery());
    }

    function openSearch() {
        $('.search-panel').addClass('is-open').attr('aria-hidden', 'false');
        loadSearchIndex().then(function() {
            refreshSearchResults();
        });
        setTimeout(function() {
            $('#site-search-input').trigger('focus');
            refreshSearchResults();
        }, 80);
    }

    function closeSearch() {
        $('.search-panel').removeClass('is-open').attr('aria-hidden', 'true');
    }

    function closeContactTips(except) {
        $('.social-contact.is-active').not(except || []).removeClass('is-active').attr('aria-expanded', 'false');
    }

    function clearContactTimer(contact) {
        if (contact && contact._contactCloseTimer) {
            clearTimeout(contact._contactCloseTimer);
            contact._contactCloseTimer = null;
        }
    }

    function revealPage() {
        $('.page, .side-card').removeClass('content-ready');
        setTimeout(function() {
            $('.page, .side-card').addClass('content-ready');
            initMotion();
        }, 40);
    }

    function initMotion() {
        var cards = document.querySelectorAll('.article-card, .section-head');
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

    $(document).on('mousemove', '.article-card', function(e) {
        var rect = this.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        this.style.setProperty('--mouse-x', x + '%');
        this.style.setProperty('--mouse-y', y + '%');
    });

    initTheme();
    revealPage();

    $('.theme-toggle').click(function() {
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    $('.search-toggle').click(openSearch);
    $('.search-close').click(closeSearch);
    $(document).on('input search keyup change', '#site-search-input', refreshSearchResults);
    $('.search-panel').click(function(e) {
        if ($(e.target).is('.search-panel')) closeSearch();
    });
    $(document).on('keydown', function(e) {
        if (e.key === 'Escape') {
            closeSearch();
            closeContactTips();
        }
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

    function closeMenus() {
        $(".header_wrap").removeClass("menus-open").addClass("menus-close");
        $(".has-submenu").removeClass("submenu-open");
        if (document.activeElement && $(document.activeElement).closest(".menus_items").length) {
            document.activeElement.blur();
        }
    }

    // menu
    $(".menus_icon").click(function () {
        if ($(".header_wrap").hasClass("menus-open")) {
            closeMenus();
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

    $(document).on('mousedown mouseup click', '.social-contact-tip', function(e) {
        e.stopPropagation();
    });

    $(document).on('click', '.social-contact', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if ($(e.target).closest('.social-contact-tip').length) return;
        clearContactTimer(this);
        var $button = $(this);
        var shouldOpen = !$button.hasClass('is-active');
        closeContactTips(this);
        $button.toggleClass('is-active', shouldOpen).attr('aria-expanded', shouldOpen ? 'true' : 'false');
    });

    $(document).on('mouseenter', '.social-contact', function() {
        clearContactTimer(this);
    });

    $(document).on('mouseleave focusout', '.social-contact', function() {
        var contact = this;
        clearContactTimer(contact);
        contact._contactCloseTimer = setTimeout(function() {
            $(contact).removeClass('is-active').attr('aria-expanded', 'false');
            contact._contactCloseTimer = null;
        }, 160);
    });

    $(document).click(function(e){
        var target = $(e.target);
        closeContactTips();
        if(target.closest(".author-links").length != 0) return;
        $(".author-links").removeClass("is-open").addClass("is-close")
        if((target.closest(".menus_icon").length != 0) || (target.closest(".menus_items").length != 0)) return;
        closeMenus();
    })

    $(document).on('touchstart pointerdown', '.article-card', function() {
        closeMenus();
    });

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

    function currentCategorySlug() {
        var slug = (window.location.hash || '').replace(/^#/, '').toLowerCase();
        return slug || 'all';
    }

    function setCategoryFilter(slug) {
        var container = document.getElementById('article-grid-container');
        if (!container) return;

        var activeSlug = slug || currentCategorySlug();
        var showAll = !activeSlug || activeSlug === 'all';
        var visibleCount = 0;
        var cards = Array.from(container.querySelectorAll('.article-card'));

        cards.forEach(function(card) {
            var isVisible = showAll || card.dataset.categorySlug === activeSlug;
            card.hidden = !isVisible;
            if (isVisible) visibleCount += 1;
        });

        $('.content-category-nav .content-category-link')
            .removeClass('is-active')
            .filter(function() {
                return ($(this).data('category-filter') || 'all') === activeSlug;
            })
            .addClass('is-active');

        var activeLink = document.querySelector('.content-category-nav .content-category-link.is-active');
        if (activeLink && window.matchMedia && window.matchMedia('(max-width: 959px)').matches) {
            activeLink.scrollIntoView({
                block: 'nearest',
                inline: 'center'
            });
        }

        var empty = document.getElementById('article-filter-empty');
        if (empty) empty.hidden = visibleCount > 0;
    }

    function scrollToArticleGrid() {
        var target = $('#article-grid-container');
        if (!target.length) return;
        $('html,body').animate({
            scrollTop: Math.max(0, target.offset().top - 120)
        }, 450);
    }

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

        setCategoryFilter(currentCategorySlug());
    }

    $(document).on('click', '.content-category-nav a[data-category-filter]', function(event) {
        var link = this;
        var linkUrl = new URL(link.href, window.location.href);
        var samePage = linkUrl.origin === window.location.origin && linkUrl.pathname === window.location.pathname;

        if (!samePage || !link.closest('.content-category-nav') || !document.getElementById('article-grid-container')) return;

        event.preventDefault();
        var slug = ($(link).data('category-filter') || 'all').toString();
        history.pushState(null, '', linkUrl.pathname + (slug === 'all' ? '#all' : '#' + slug));
        setCategoryFilter(slug);
        scrollToArticleGrid();
    });

    $(window).on('hashchange', function() {
        setCategoryFilter(currentCategorySlug());
    });

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
                closeMenus();
            }
            if ($(".author-links").hasClass("is-open")) {
                $(".author-links").removeClass("is-open").addClass("is-close")
            }
            // ========== PJAX 加载完成后初始化卡片 ==========
            setTimeout(function() {
                initArticleCards();
                setCategoryFilter(currentCategorySlug());
            }, 100);
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
