// article-selection.js - CORREÇÕES COMPLETAS

// Função corrigida para obter todos os artigos disponíveis
function getAllAvailableArticles() {
    const articles = [];
    const articleMap = new Map();

    console.log(
        '[DEBUG] getAllAvailableArticles - Iniciando busca por artigos'
    );
    console.log('[DEBUG] Total de chunks:', lexiaChunks.length);

    lexiaChunks.forEach((chunk) => {
        console.log(`[DEBUG] Processando chunk: ${chunk.id}`, {
            legalArticles: chunk.legalArticles ? chunk.legalArticles.length : 0,
        });

        if (chunk.legalArticles && chunk.legalArticles.length > 0) {
            chunk.legalArticles.forEach((article) => {
                // **CORREÇÃO CRÍTICA**: Usar o ID real do artigo em vez de gerar um novo
                const articleId = article.id; // Este é o ID real gerado durante a extração

                if (!articleMap.has(articleId)) {
                    articleMap.set(articleId, {
                        id: articleId, // ID real do artigo
                        fullReference:
                            article.fullReference || `Art. ${article.number}`,
                        subject: article.subject || 'Assunto não disponível',
                        law: article.law || 'Lei não identificada',
                        number: article.number || '',
                        fullText: article.fullText || '',
                        context: article.context || '',
                        chunkId: chunk.id,
                        fileName: chunk.file,
                    });
                    console.log(
                        `[DEBUG] Artigo adicionado: ${articleId} - ${article.fullReference}`
                    );
                }
            });
        }
    });

    const result = Array.from(articleMap.values()).sort((a, b) => {
        const lawA = a.law || '';
        const lawB = b.law || '';
        const numberA = a.number || '';
        const numberB = b.number || '';

        if (lawA !== lawB) {
            return lawA.localeCompare(lawB);
        }
        return numberA.localeCompare(numberB);
    });

    console.log(
        '[DEBUG] getAllAvailableArticles - Total encontrado:',
        result.length
    );
    return result;
}

// Função corrigida para encontrar artigos
function findArticleById(articleId) {
    console.log(`[DEBUG] findArticleById - Buscando: ${articleId}`);

    // Busca direta pelo ID real do artigo
    for (const chunk of lexiaChunks) {
        if (chunk.legalArticles) {
            for (const article of chunk.legalArticles) {
                // **CORREÇÃO**: Comparação direta com o ID real
                if (article.id === articleId) {
                    console.log(`[DEBUG] Artigo encontrado diretamente:`, {
                        id: article.id,
                        reference: article.fullReference,
                        law: article.law,
                    });
                    return {
                        ...article,
                        chunkId: chunk.id,
                    };
                }
            }
        }
    }

    // Fallback: busca por componentes do ID
    console.log(`[DEBUG] Busca direta falhou, tentando fallback...`);

    // Tenta extrair informações do ID para busca alternativa
    const idParts = articleId.split('-');
    if (idParts.length >= 3) {
        const possibleArticleNumber = idParts[idParts.length - 1]; // Última parte pode ser o número
        const possibleFileName = idParts.slice(1, -1).join('-'); // Parte do meio pode ser o nome do arquivo

        console.log(`[DEBUG] Tentando fallback com:`, {
            possibleArticleNumber,
            possibleFileName,
        });

        for (const chunk of lexiaChunks) {
            if (chunk.legalArticles && chunk.file.includes(possibleFileName)) {
                for (const article of chunk.legalArticles) {
                    if (article.number === possibleArticleNumber) {
                        console.log(
                            `[DEBUG] Artigo encontrado via fallback:`,
                            article
                        );
                        return {
                            ...article,
                            chunkId: chunk.id,
                        };
                    }
                }
            }
        }
    }

    console.warn(
        `[DEBUG] Artigo não encontrado após todas as tentativas: ${articleId}`
    );
    return null;
}

// Função corrigida para obter artigos selecionados
function getSelectedArticles() {
    const selectedCheckboxes = document.querySelectorAll(
        '.article-checkbox:checked'
    );
    const selectedArticles = [];

    console.log(
        `[DEBUG] getSelectedArticles - Checkboxes selecionados: ${selectedCheckboxes.length}`
    );

    selectedCheckboxes.forEach((checkbox, index) => {
        const articleId = checkbox.dataset.articleId;
        const articleReference = checkbox.dataset.articleReference;

        console.log(`[DEBUG] Processando checkbox ${index + 1}:`, {
            articleId,
            articleReference,
            checked: checkbox.checked,
        });

        // Verificar se o checkbox está realmente selecionado
        if (!checkbox.checked) {
            console.log(
                `[DEBUG] Checkbox ${index + 1} não está selecionado, pulando`
            );
            return;
        }

        // Encontrar o artigo completo
        const article = findArticleById(articleId);
        if (article) {
            selectedArticles.push(article);
            console.log(
                `[DEBUG] Artigo adicionado à seleção: ${article.fullReference}`
            );
        } else {
            console.error(
                `[DEBUG] ARTIGO NÃO ENCONTRADO: ${articleId} - ${articleReference}`
            );

            // Debug adicional: listar todos os artigos disponíveis
            console.log('[DEBUG] Artigos disponíveis:');
            getAllAvailableArticles().forEach((art, idx) => {
                console.log(`  ${idx + 1}. ${art.id} - ${art.fullReference}`);
            });
        }
    });

    console.log(
        `[DEBUG] getSelectedArticles - Total encontrado: ${selectedArticles.length}`
    );

    if (selectedArticles.length === 0) {
        console.error('[DEBUG] NENHUM ARTIGO VÁLIDO ENCONTRADO!');
        console.error('[DEBUG] Possíveis causas:');
        console.error('- IDs inconsistentes entre extração e seleção');
        console.error('- Artigos removidos após extração');
        console.error('- Problema na geração dos checkboxes');
    }

    return selectedArticles;
}

// Adicione esta função para verificar a consistência dos dados
function validateArticleDataConsistency() {
    console.log('=== VALIDAÇÃO DE CONSISTÊNCIA DE DADOS ===');

    const availableArticles = getAllAvailableArticles();
    console.log('Artigos disponíveis no sistema:', availableArticles.length);

    // Verificar checkboxes no DOM
    const checkboxes = document.querySelectorAll('.article-checkbox');
    console.log('Checkboxes no DOM:', checkboxes.length);

    checkboxes.forEach((checkbox, index) => {
        const articleId = checkbox.dataset.articleId;
        const article = findArticleById(articleId);

        console.log(`Checkbox ${index + 1}:`, {
            id: articleId,
            reference: checkbox.dataset.articleReference,
            encontrado: !!article,
            referenciaEncontrada: article
                ? article.fullReference
                : 'NÃO ENCONTRADO',
        });
    });

    console.log('=== FIM DA VALIDAÇÃO ===');
}

// Modifique a função setupArticleSelectionListeners para incluir validação
function setupArticleSelectionListeners() {
    const useSpecificArticlesCheckbox = document.getElementById(
        'use-specific-articles'
    );
    const articlesSelection = document.getElementById('articles-selection');
    const articlesSearch = document.getElementById('articles-search');
    const selectAllBtn = document.getElementById('select-all-articles');
    const clearBtn = document.getElementById('clear-articles');

    if (!useSpecificArticlesCheckbox) {
        console.error('Checkbox use-specific-articles não encontrado!');
        return;
    }

    // Toggle da seção de seleção de artigos
    useSpecificArticlesCheckbox.addEventListener('change', function () {
        if (this.checked) {
            articlesSelection.style.display = 'block';
            updateArticlesList();

            // Validação de consistência quando a seção é aberta
            setTimeout(validateArticleDataConsistency, 100);
        } else {
            articlesSelection.style.display = 'none';
        }
    });

    // Busca de artigos
    if (articlesSearch) {
        articlesSearch.addEventListener('input', function () {
            filterArticles(this.value);
        });
    }

    // Selecionar todos os artigos
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', function () {
            const checkboxes = document.querySelectorAll('.article-checkbox');
            checkboxes.forEach((checkbox) => {
                if (!checkbox.disabled) {
                    checkbox.checked = true;
                }
            });
            updateSelectedCount();
        });
    }

    // Limpar seleção
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            const checkboxes = document.querySelectorAll('.article-checkbox');
            checkboxes.forEach((checkbox) => {
                checkbox.checked = false;
            });
            updateSelectedCount();
        });
    }

    // Event delegation para checkboxes de artigos
    document.addEventListener('change', function (e) {
        if (e.target.classList.contains('article-checkbox')) {
            updateSelectedCount();
        }
    });
}

// Adicione esta função para debug avançado
function debugArticleSelection() {
    console.log('=== DEBUG AVANÇADO - SELEÇÃO DE ARTIGOS ===');

    // 1. Verificar estrutura dos chunks
    console.log('1. ESTRUTURA DOS CHUNKS:');
    lexiaChunks.forEach((chunk, index) => {
        console.log(`   Chunk ${index + 1}:`, {
            id: chunk.id,
            file: chunk.file,
            articles: chunk.legalArticles ? chunk.legalArticles.length : 0,
        });

        if (chunk.legalArticles) {
            chunk.legalArticles.forEach((article, artIndex) => {
                console.log(`     Artigo ${artIndex + 1}:`, {
                    id: article.id,
                    number: article.number,
                    fullReference: article.fullReference,
                    law: article.law,
                });
            });
        }
    });

    // 2. Verificar artigos disponíveis
    console.log('2. ARTIGOS DISPONÍVEIS:');
    const available = getAllAvailableArticles();
    available.forEach((article, index) => {
        console.log(
            `   ${index + 1}. ${article.id} - ${article.fullReference}`
        );
    });

    // 3. Verificar checkboxes no DOM
    console.log('3. CHECKBOXES NO DOM:');
    const checkboxes = document.querySelectorAll('.article-checkbox');
    checkboxes.forEach((checkbox, index) => {
        console.log(`   ${index + 1}.`, {
            id: checkbox.dataset.articleId,
            reference: checkbox.dataset.articleReference,
            checked: checkbox.checked,
        });
    });

    // 4. Testar busca de artigos selecionados
    console.log('4. TESTE DE BUSCA:');
    const selected = getSelectedArticles();
    console.log(`   Artigos selecionados encontrados: ${selected.length}`);

    console.log('=== FIM DO DEBUG AVANÇADO ===');
}

// No final do arquivo, adicione:
console.log('article-selection.js carregado - versão corrigida');

// Exporte as funções para debug global
window.debugArticleSelection = debugArticleSelection;
window.validateArticleDataConsistency = validateArticleDataConsistency;
