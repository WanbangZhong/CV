(function () {
    'use strict';

    function ready(callback) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback, { once: true });
        } else {
            callback();
        }
    }

    ready(function () {
        var root = document.documentElement;
        var body = document.body;
        var searchPanel = document.querySelector('.search-panel');
        var searchResults = document.querySelector('.search-results');
        var searchInput = document.getElementById('site-search-input');
        var rewardModal = document.querySelector('.reward-modal');
        var scheduleFrame = window.requestAnimationFrame || function (callback) {
            return setTimeout(callback, 16);
        };

        function all(selector, context) {
            return Array.from((context || document).querySelectorAll(selector));
        }

        function delegate(eventName, selector, handler, options) {
            document.addEventListener(eventName, function (event) {
                var target = event.target.closest && event.target.closest(selector);
                if (target) handler.call(target, event);
            }, options);
        }

        function isAcademicStyle() {
            return body.classList.contains('academic-style');
        }

        function syncStyleToggle(mode) {
            var isAcademic = mode === 'academic';
            all('.style-toggle').forEach(function (toggle) {
                toggle.setAttribute('aria-pressed', isAcademic ? 'true' : 'false');
                toggle.setAttribute('aria-label', isAcademic ? 'Switch to current style' : 'Switch to simple style');
            });
            all('.style-icon').forEach(function (icon) {
                icon.classList.toggle('fa-toggle-on', isAcademic);
                icon.classList.toggle('fa-toggle-off', !isAcademic);
            });
            all('.style-label').forEach(function (label) {
                label.textContent = isAcademic ? 'Simple' : 'Normal';
            });
            all('.theme-toggle').forEach(function (toggle) {
                toggle.disabled = isAcademic;
                toggle.setAttribute('aria-hidden', isAcademic ? 'true' : 'false');
            });
        }

        function setTheme(mode, persist) {
            if (isAcademicStyle() && mode === 'dark') mode = 'light';
            root.setAttribute('data-theme', mode);
            if (persist !== false) localStorage.setItem('site-theme', mode);
            all('.theme-icon').forEach(function (icon) {
                icon.classList.toggle('fa-moon', mode !== 'dark');
                icon.classList.toggle('fa-sun', mode === 'dark');
            });
        }

        function initTheme() {
            var saved = localStorage.getItem('site-theme');
            var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(saved || (prefersDark ? 'dark' : 'light'));
        }

        function setStyleMode(mode, persist) {
            var styleMode = mode === 'academic' ? 'academic' : 'current';
            body.classList.toggle('academic-style', styleMode === 'academic');
            body.classList.toggle('current-style', styleMode !== 'academic');

            if (styleMode === 'academic') {
                setTheme('light', false);
            } else {
                initTheme();
            }

            if (persist) localStorage.setItem('site-style-mode', styleMode);
            syncStyleToggle(styleMode);
        }

        function initStyleMode() {
            var saved = localStorage.getItem('site-style-mode');
            var defaultMode = root.getAttribute('data-default-style') || 'current';
            setStyleMode(saved || defaultMode, false);
        }

        var searchItems = [];
        var searchIndexLoaded = false;
        var searchIndexLoading = null;
        var searchRefreshPending = false;
        var searchBaseUrl = null;

        function loadSearchIndex() {
            if (searchIndexLoaded) return Promise.resolve(searchItems);
            if (searchIndexLoading) return searchIndexLoading;

            var indexUrl = searchPanel && searchPanel.getAttribute('data-search-index-url');
            if (!indexUrl) {
                searchIndexLoaded = true;
                return Promise.resolve(searchItems);
            }

            searchResults.innerHTML = '<div class="search-empty">Loading search index...</div>';
            searchIndexLoading = fetch(indexUrl, { credentials: 'same-origin' })
                .then(function (response) {
                    if (!response.ok) throw new Error('Search index request failed');
                    return response.json();
                })
                .then(function (items) {
                    searchItems = Array.isArray(items) ? items : [];
                    searchIndexLoaded = true;
                    return searchItems;
                })
                .catch(function () {
                    searchItems = [];
                    searchIndexLoaded = true;
                    searchResults.innerHTML = '<div class="search-empty">Search index could not be loaded. Please rebuild the site.</div>';
                    return searchItems;
                });

            return searchIndexLoading;
        }

        function escapeHtml(value) {
            var element = document.createElement('div');
            element.textContent = value || '';
            return element.innerHTML;
        }

        function highlightTerm(text, terms) {
            var safeText = escapeHtml(text);
            if (!terms || !terms.length) return safeText;
            terms.forEach(function (term) {
                var escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                safeText = safeText.replace(new RegExp('(' + escaped + ')', 'ig'), '<mark>$1</mark>');
            });
            return safeText;
        }

        function currentSearchQuery() {
            return searchInput ? searchInput.value : '';
        }

        function searchDataBaseUrl() {
            if (searchBaseUrl !== null) return searchBaseUrl;
            var indexUrl = searchPanel && searchPanel.getAttribute('data-search-index-url');
            searchBaseUrl = indexUrl ? indexUrl.replace(/search\.json(?:[?#].*)?$/, '') : '';
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
            terms.some(function (term) {
                matchIndex = lower.indexOf(term);
                return matchIndex !== -1;
            });
            if (matchIndex === -1) return source.slice(0, 150);

            var sentenceStart = Math.max(source.lastIndexOf('.', matchIndex), source.lastIndexOf('。', matchIndex));
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
            searchResults.innerHTML = '<div class="search-empty">' + message + '</div>';
        }

        function searchSite(query) {
            var terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
            if (!terms.length) {
                renderSearchEmpty('Type a keyword to search the site.');
                return;
            }
            if (!searchIndexLoaded) {
                if (!searchRefreshPending) {
                    searchRefreshPending = true;
                    loadSearchIndex().then(function () {
                        searchRefreshPending = false;
                        searchSite(currentSearchQuery());
                    });
                }
                return;
            }
            if (!searchItems.length) {
                renderSearchEmpty('Search index is empty. Please rebuild the site.');
                return;
            }

            var matches = searchItems.reduce(function (results, item) {
                var title = (item.title || '').toLowerCase();
                var text = (item.text || '').toLowerCase();
                var meta = [item.type, item.date].join(' ').toLowerCase();
                var haystack = [title, text, meta].join(' ');
                if (!terms.every(function (term) { return haystack.indexOf(term) !== -1; })) return results;

                var score = 3;
                terms.forEach(function (term) {
                    if (title.indexOf(term) !== -1) score += 6;
                    if (text.indexOf(term) !== -1) score += 2;
                    if (meta.indexOf(term) !== -1) score += 1;
                });
                results.push({ item: item, score: score });
                return results;
            }, []).sort(function (a, b) { return b.score - a.score; });

            if (!matches.length) {
                renderSearchEmpty('No articles found for "' + escapeHtml(query) + '".');
                return;
            }

            var resultList = matches.map(function (match) {
                var item = match.item;
                var snippet = makeSnippet(item.text, terms);
                return '<li><a class="search-result" href="' + searchResultUrl(item.url) + '">' +
                    '<span class="search-type">' + escapeHtml(item.type) + (item.date ? ' / ' + escapeHtml(item.date) : '') + '</span>' +
                    '<span class="search-result-title">' + highlightTerm(item.title, terms) + '</span>' +
                    '<span class="search-result-snippet">' + highlightTerm(snippet, terms) + '</span>' +
                    '</a></li>';
            }).join('');

            searchResults.innerHTML = '<div class="search-count">' + matches.length +
                (matches.length === 1 ? ' article' : ' articles') +
                ' found</div><ul class="search-result-list">' + resultList + '</ul>';
        }

        function refreshSearchResults() {
            searchSite(currentSearchQuery());
        }

        function openSearch() {
            searchPanel.classList.add('is-open');
            searchPanel.setAttribute('aria-hidden', 'false');
            refreshSearchResults();
            setTimeout(function () { searchInput.focus(); }, 80);
        }

        function closeSearch() {
            searchPanel.classList.remove('is-open');
            searchPanel.setAttribute('aria-hidden', 'true');
        }

        function openRewardModal(label, image) {
            var img = rewardModal.querySelector('.reward-qr');
            rewardModal.querySelector('.reward-method').textContent = label || '';
            img.classList.remove('is-missing');
            img.onload = function () { img.classList.remove('is-missing'); };
            img.onerror = function () { img.classList.add('is-missing'); };
            img.src = image || '';
            img.alt = (label || 'Reward') + ' QR code';
            if (!image) img.classList.add('is-missing');
            rewardModal.classList.add('is-open');
            rewardModal.setAttribute('aria-hidden', 'false');
        }

        function closeRewardModal() {
            rewardModal.classList.remove('is-open');
            rewardModal.setAttribute('aria-hidden', 'true');
        }

        function closeContactTips(except) {
            all('.social-contact.is-active').forEach(function (contact) {
                if (contact === except) return;
                contact.classList.remove('is-active');
                contact.setAttribute('aria-expanded', 'false');
            });
        }

        function clearContactTimer(contact) {
            if (!contact || !contact._contactCloseTimer) return;
            clearTimeout(contact._contactCloseTimer);
            contact._contactCloseTimer = null;
        }

        function initMotion() {
            var cards = all('.article-card, .section-head');
            cards.forEach(function (card) { card.classList.add('motion-watch'); });
            if (!('IntersectionObserver' in window)) {
                cards.forEach(function (card) { card.classList.add('is-visible'); });
                return;
            }

            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                });
            }, { threshold: 0.14 });
            cards.forEach(function (card) {
                if (!card.classList.contains('is-visible')) observer.observe(card);
            });
        }

        function revealPage() {
            all('.page, .side-card').forEach(function (element) { element.classList.remove('content-ready'); });
            setTimeout(function () {
                all('.page, .side-card').forEach(function (element) { element.classList.add('content-ready'); });
                initMotion();
            }, 40);
        }

        function closeMenus() {
            var header = document.querySelector('.header_wrap');
            header.classList.remove('menus-open');
            header.classList.add('menus-close');
            all('.has-submenu').forEach(function (item) { item.classList.remove('submenu-open'); });
            all('.submenu-toggle').forEach(function (toggle) { toggle.setAttribute('aria-expanded', 'false'); });
            if (document.activeElement && document.activeElement.closest('.menus_items')) document.activeElement.blur();
        }

        function closeAuthorLinks() {
            all('.author-links').forEach(function (links) {
                links.classList.remove('is-open');
                links.classList.add('is-close');
            });
        }

        function currentCategorySlug() {
            return (window.location.hash || '').replace(/^#/, '').toLowerCase() || 'all';
        }

        function scrollActiveCategoryLink(activeLink) {
            var nav = activeLink && activeLink.closest('.content-category-nav');
            if (!nav) return;
            var style = window.getComputedStyle(nav);
            var paddingLeft = parseFloat(style.paddingLeft) || 0;
            var paddingRight = parseFloat(style.paddingRight) || 0;
            var visibleLeft = nav.scrollLeft + paddingLeft + 8;
            var visibleRight = nav.scrollLeft + nav.clientWidth - paddingRight - 8;
            var linkLeft = activeLink.offsetLeft;
            var linkRight = linkLeft + activeLink.offsetWidth;
            var nextScroll = nav.scrollLeft;

            if (linkLeft < visibleLeft) nextScroll = linkLeft - paddingLeft - 8;
            else if (linkRight > visibleRight) nextScroll = linkRight - nav.clientWidth + paddingRight + 8;

            nextScroll = Math.max(0, Math.min(nextScroll, nav.scrollWidth - nav.clientWidth));
            if (Math.abs(nextScroll - nav.scrollLeft) < 1) return;
            nav.scrollTo ? nav.scrollTo({ left: nextScroll, behavior: 'smooth' }) : (nav.scrollLeft = nextScroll);
        }

        function setCategoryFilter(slug) {
            var container = document.getElementById('article-grid-container');
            if (!container) return;
            var activeSlug = slug || currentCategorySlug();
            var showAll = activeSlug === 'all';
            var visibleCount = 0;

            all('.article-card', container).forEach(function (card) {
                var isVisible = showAll || card.dataset.categorySlug === activeSlug;
                if (card.hidden === isVisible) card.hidden = !isVisible;
                if (isVisible) visibleCount += 1;
            });
            all('.content-category-link').forEach(function (link) {
                link.classList.toggle('is-active', (link.dataset.categoryFilter || 'all') === activeSlug);
            });

            var activeLink = document.querySelector('.content-category-link.is-active');
            if (activeLink && window.matchMedia('(max-width: 959px)').matches) scrollActiveCategoryLink(activeLink);
            var empty = document.getElementById('article-filter-empty');
            if (empty && empty.hidden !== (visibleCount > 0)) empty.hidden = visibleCount > 0;
        }

        function initArticleCards() {
            var container = document.getElementById('article-grid-container');
            if (!container) return;
            var cards = Array.from(container.children);
            if (!cards.length) return;
            var sortedCards = cards.slice().sort(function (a, b) {
                return Date.parse(b.dataset.time) - Date.parse(a.dataset.time);
            });
            if (sortedCards.some(function (card, index) { return card !== cards[index]; })) {
                var fragment = document.createDocumentFragment();
                sortedCards.forEach(function (card) { fragment.appendChild(card); });
                container.appendChild(fragment);
            }
            setCategoryFilter(currentCategorySlug());
        }

        function scrollTo(target, offset) {
            var top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
            window.scrollTo({ top: Math.max(0, top - (offset || 0)), behavior: 'smooth' });
        }

        var navigationController = null;
        var navigationSequence = 0;
        function finishNavigation() {
            closeMenus();
            closeAuthorLinks();
            initArticleCards();
            syncStyleToggle(isAcademicStyle() ? 'academic' : 'current');
            revealPage();
            document.dispatchEvent(new CustomEvent('pjax:end'));
        }

        function navigate(url, pushState) {
            var sequence = ++navigationSequence;
            if (navigationController) navigationController.abort();
            navigationController = 'AbortController' in window ? new AbortController() : null;
            document.dispatchEvent(new CustomEvent('pjax:click'));
            scrollTo(0);

            var options = { headers: { 'X-PJAX': 'true', 'X-PJAX-Container': '.page' } };
            if (navigationController) options.signal = navigationController.signal;
            fetch(url, options)
                .then(function (response) {
                    if (!response.ok) throw new Error('Navigation request failed');
                    return response.text().then(function (html) {
                        return { html: html, url: response.url || url };
                    });
                })
                .then(function (result) {
                    if (sequence !== navigationSequence) return;
                    var nextDocument = new DOMParser().parseFromString(result.html, 'text/html');
                    var nextPage = nextDocument.querySelector('.page');
                    var currentPage = document.querySelector('.page');
                    if (!nextPage || !currentPage) throw new Error('PJAX fragment missing');
                    currentPage.replaceWith(document.importNode(nextPage, true));
                    document.title = nextDocument.title;
                    if (pushState) history.pushState(null, '', result.url);
                    navigationController = null;
                    finishNavigation();
                })
                .catch(function (error) {
                    if (sequence !== navigationSequence || error.name === 'AbortError') return;
                    navigationController = null;
                    window.location.href = url;
                });
        }

        initStyleMode();
        revealPage();
        closeMenus();
        initArticleCards();

        delegate('mousemove', '.article-card', function (event) {
            var card = this;
            card._pointerX = event.clientX;
            card._pointerY = event.clientY;
            if (card._pointerFrame) return;
            card._pointerFrame = scheduleFrame(function () {
                var rect = card.getBoundingClientRect();
                card.style.setProperty('--mouse-x', ((card._pointerX - rect.left) / rect.width) * 100 + '%');
                card.style.setProperty('--mouse-y', ((card._pointerY - rect.top) / rect.height) * 100 + '%');
                card._pointerFrame = null;
            });
        });

        delegate('click', '.style-toggle', function () {
            setStyleMode(isAcademicStyle() ? 'current' : 'academic', true);
        });
        delegate('click', '.theme-toggle', function () {
            if (isAcademicStyle()) return;
            setTheme((root.getAttribute('data-theme') || 'light') === 'dark' ? 'light' : 'dark');
        });
        delegate('click', '.search-toggle', openSearch);
        delegate('click', '.search-close, .search-result', closeSearch);
        ['input', 'search', 'change'].forEach(function (eventName) {
            searchInput.addEventListener(eventName, refreshSearchResults);
        });
        searchPanel.addEventListener('click', function (event) {
            if (event.target === searchPanel) closeSearch();
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                closeSearch();
                closeRewardModal();
                closeContactTips();
            }
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                openSearch();
            }
        });

        delegate('click', '.footer-reward-button', function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeContactTips();
            openRewardModal(this.dataset.rewardLabel, this.dataset.rewardImage);
        });
        delegate('click', '.reward-close', closeRewardModal);
        rewardModal.addEventListener('click', function (event) {
            if (event.target === rewardModal) closeRewardModal();
        });

        all('.has-submenu').forEach(function (item) {
            item.addEventListener('mouseenter', function () {
                if (window.matchMedia('(max-width: 959px)').matches) return;
                clearTimeout(item._submenuTimer);
                item.classList.add('submenu-open');
            });
            item.addEventListener('mouseleave', function () {
                item._submenuTimer = setTimeout(function () { item.classList.remove('submenu-open'); }, 120);
            });
        });

        delegate('click', '.menus_icon', function () {
            var header = document.querySelector('.header_wrap');
            if (header.classList.contains('menus-open')) closeMenus();
            else {
                all('.has-submenu').forEach(function (item) { item.classList.remove('submenu-open'); });
                all('.submenu-toggle').forEach(function (toggle) { toggle.setAttribute('aria-expanded', 'false'); });
                header.classList.remove('menus-close');
                header.classList.add('menus-open');
            }
        });
        delegate('click', '.submenu-toggle', function (event) {
            event.preventDefault();
            event.stopPropagation();
            var item = this.closest('.has-submenu');
            var shouldOpen = !item.classList.contains('submenu-open');
            item.classList.toggle('submenu-open', shouldOpen);
            this.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        });
        delegate('click', '.m-social-links', function () {
            var links = this.closest('.author-links');
            var shouldOpen = !links.classList.contains('is-open');
            links.classList.toggle('is-open', shouldOpen);
            links.classList.toggle('is-close', !shouldOpen);
        });

        delegate('click', '.social-contact', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.target.closest('.social-contact-tip')) return;
            clearContactTimer(this);
            var shouldOpen = !this.classList.contains('is-active');
            closeContactTips(this);
            this.classList.toggle('is-active', shouldOpen);
            this.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        });
        all('.social-contact').forEach(function (contact) {
            contact.addEventListener('mouseenter', function () { clearContactTimer(contact); });
            ['mouseleave', 'focusout'].forEach(function (eventName) {
                contact.addEventListener(eventName, function () {
                    clearContactTimer(contact);
                    contact._contactCloseTimer = setTimeout(function () {
                        contact.classList.remove('is-active');
                        contact.setAttribute('aria-expanded', 'false');
                        contact._contactCloseTimer = null;
                    }, 160);
                });
            });
        });

        document.addEventListener('click', function (event) {
            if (event.target.closest('.social-contact')) return;
            closeContactTips();
            if (event.target.closest('.author-links')) return;
            closeAuthorLinks();
            if (event.target.closest('.menus_icon, .menus_items')) return;
            closeMenus();
        });

        delegate(window.PointerEvent ? 'pointerdown' : 'touchstart', '.article-card', closeMenus, { passive: true });

        var backToTopFrame = null;
        var backToTop = document.querySelector('.nav-wrap');
        window.addEventListener('scroll', function () {
            if (backToTopFrame) return;
            backToTopFrame = scheduleFrame(function () {
                backToTop.classList.toggle('is-visible', window.scrollY > 100);
                backToTopFrame = null;
            });
        }, { passive: true });
        delegate('click', '.cd-top', function (event) {
            event.preventDefault();
            scrollTo(0);
        });

        delegate('click', '.content-category-link[data-category-filter]', function (event) {
            var url = new URL(this.href, window.location.href);
            if (url.origin !== location.origin || url.pathname !== location.pathname || !document.getElementById('article-grid-container')) return;
            event.preventDefault();
            var slug = this.dataset.categoryFilter || 'all';
            history.pushState(null, '', url.pathname + (slug === 'all' ? '#all' : '#' + slug));
            setCategoryFilter(slug);
            scrollTo(document.getElementById('article-grid-container'), 120);
        });
        window.addEventListener('hashchange', function () { setCategoryFilter(currentCategorySlug()); });

        document.addEventListener('click', function (event) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            var link = event.target.closest('a[href]');
            if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
            var url = new URL(link.href, location.href);
            if (url.origin !== location.origin) return;

            if (url.pathname === location.pathname && url.search === location.search && url.hash) {
                var target = document.getElementById(decodeURIComponent(url.hash.slice(1))) || document.querySelector('[name="' + decodeURIComponent(url.hash.slice(1)) + '"]');
                if (target) {
                    event.preventDefault();
                    history.pushState(null, '', url.href);
                    scrollTo(target);
                }
                return;
            }

            event.preventDefault();
            navigate(url.href, true);
        });
        window.addEventListener('popstate', function () { navigate(location.href, false); });
    });
})();
