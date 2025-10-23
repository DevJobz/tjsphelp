// app.js - Lexia Study App

// Global variables
let uploadedPdfs = [];
let lexiaChunks = JSON.parse(localStorage.getItem('lexia_chunks')) || [];
// Ensure all chunks have legalArticles property
lexiaChunks = lexiaChunks.map((chunk) => ({
    ...chunk,
    legalArticles: chunk.legalArticles || [],
}));
// --- Higienização de Dados ao Carregar --- //
// Carrega os flashcards salvos e garante que todos tenham a estrutura de dados correta.
// Isso evita que dados antigos ou corrompidos quebrem a aplicação.
// --- Higienização de Dados ao Carregar --- //
let lexiaFlashcards = (
    JSON.parse(localStorage.getItem('lexia_flashcards')) || []
)
    .map((card, index) => {
        // Verificação mais robusta de dados inválidos
        if (!card || typeof card !== 'object' || !card.id) {
            console.warn('Entrada de flashcard inválida foi removida:', card);
            return null;
        }

        // Garante que todas as propriedades essenciais existam
        return {
            id: card.id,
            question:
                card.question || `[Flashcard Corrompido - ID: ${card.id}]`,
            answer: card.answer || '[Sem Resposta]',
            chunkId: card.chunkId || '',
            easiness: typeof card.easiness === 'number' ? card.easiness : 2.5,
            interval: typeof card.interval === 'number' ? card.interval : 1,
            repetitions:
                typeof card.repetitions === 'number' ? card.repetitions : 0,
            nextReview: card.nextReview
                ? new Date(card.nextReview)
                : new Date(),
            created: card.created || new Date().toISOString(),
            lastReviewed: card.lastReviewed
                ? new Date(card.lastReviewed)
                : null,
            viewCount: typeof card.viewCount === 'number' ? card.viewCount : 0,
            isFavorite: !!card.isFavorite,
            isArchived: !!card.isArchived,
            customName: card.customName || '',
            sourceTrack: card.sourceTrack || 'Geral',
            articleReference: card.articleReference || '',
            articleSubject: card.articleSubject || '',
            law: card.law || '',
            generationFocus: card.generationFocus || '',
            specificFocus: card.specificFocus || '',
            style: card.style || 'direct',
            difficultyLevel: card.difficultyLevel || null, // <-- ADICIONE ESTA LINHA (ou modifique se já existir)
        };
    })
    .filter(Boolean); // Remove entradas nulas

// Salva os dados higienizados
saveFlashcards();
let lexiaProgress = JSON.parse(localStorage.getItem('lexia_progress')) || {};
let lexiaEmbeddings =
    JSON.parse(localStorage.getItem('lexia_embeddings')) || [];
let lexiaConfig = JSON.parse(localStorage.getItem('lexia_config')) || {
    geminiApiKey: 'AIzaSyBEGZJ48GOhOFeaADHxs0HJH66f569mO0A',
    darkMode: true,
};

// Chat history
let chatHistory = JSON.parse(localStorage.getItem('lexia_chat_history')) || [];

// ===== NOVO: Variável para a instância do Mapa Mental =====
let currentMindMapInstance = null; // Para guardar a instância do mapa mental atual
// ==========================================================

// ===== NOVO: Array para armazenar mapas mentais gerados =====
let lexiaMindMaps = JSON.parse(localStorage.getItem('lexia_mind_maps')) || [];
// ==========================================================

// ===== NOVO: Função para salvar mapas mentais =====
function saveMindMaps() {
    localStorage.setItem('lexia_mind_maps', JSON.stringify(lexiaMindMaps));
    console.log('[MindMap] Mapas mentais salvos:', lexiaMindMaps.length);
}
// ===============================================

// Função auxiliar local para label de dificuldade

function getDifficultyLabel(level) {
    switch (level) {
        case 'easy':
            return 'Fácil';

        case 'medium':
            return 'Médio';

        case 'difficult':
            return 'Difícil';

        default:
            return null; // Não mostra explicitamente "Não classificado" aqui
    }
}

// Função auxiliar para verificar e esperar por elementos do DOM
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setTimeout(() => {
            observer.disconnect();
            reject(
                new Error(
                    `Elemento ${selector} não encontrado após ${timeout}ms`
                )
            );
        }, timeout);
    });
}

// --- Gestão de Estatísticas e Favoritos dos Artigos --- //

// Inicializar estruturas de dados
function initializeArticleData() {
    if (!localStorage.getItem('lexia_article_stats')) {
        localStorage.setItem('lexia_article_stats', JSON.stringify({}));
    }
    if (!localStorage.getItem('lexia_article_favorites')) {
        localStorage.setItem('lexia_article_favorites', JSON.stringify([]));
    }
}

// Obter estatísticas do artigo
function getArticleStats(articleId) {
    const stats = JSON.parse(localStorage.getItem('lexia_article_stats')) || {};
    return (
        stats[articleId] || {
            usedInQuestions: 0,
            correctAnswers: 0,
            incorrectAnswers: 0,
            lastUsed: null,
        }
    );
}

// Salvar estatísticas do artigo
function saveArticleStats(articleId, stats) {
    const allStats =
        JSON.parse(localStorage.getItem('lexia_article_stats')) || {};
    allStats[articleId] = stats;
    localStorage.setItem('lexia_article_stats', JSON.stringify(allStats));
}

// Verificar se artigo é favorito
function isArticleFavorite(articleId) {
    const favorites =
        JSON.parse(localStorage.getItem('lexia_article_favorites')) || [];
    return favorites.includes(articleId);
}

// Alternar favorito do artigo
function toggleArticleFavorite(articleId) {
    const favorites =
        JSON.parse(localStorage.getItem('lexia_article_favorites')) || [];
    const index = favorites.indexOf(articleId);

    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(articleId);
    }

    localStorage.setItem('lexia_article_favorites', JSON.stringify(favorites));
    return index === -1; // Retorna true se foi adicionado como favorito
}

// Atualizar estatísticas quando artigo é usado em questão
function updateArticleUsage(articleId, wasCorrect) {
    const stats = getArticleStats(articleId);
    stats.usedInQuestions += 1;
    if (wasCorrect) {
        stats.correctAnswers += 1;
    } else {
        stats.incorrectAnswers += 1;
    }
    stats.lastUsed = new Date().toISOString();
    saveArticleStats(articleId, stats);
}

// ==================================================================
// INÍCIO DA CORREÇÃO: Função "molde" movida para o topo da seção
// ==================================================================
function createArticleItemHTML(article, chunk, articleStats, isFavorite) {
    const usageInfo = `<div class="article-usage">
        <span class="usage-badge">📊 Utilizado em ${articleStats.usedInQuestions} questão(ões)</span>
        <span class="correct-answers">✅ ${articleStats.correctAnswers}</span>
        <span class="incorrect-answers">❌ ${articleStats.incorrectAnswers}</span>
    </div>`;

    return `
        <div class="article-item ${
            isFavorite ? 'favorite' : ''
        }" data-article-id="${article.id}">
            <div class="article-header">
                <button class="btn-icon favorite-toggle" data-article-id="${
                    article.id
                }" title="${
        isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'
    }">
                    ${isFavorite ? '⭐' : '☆'}
                </button>
                <div class="article-title">
                    <strong>${article.fullReference}</strong>
                    ${
                        articleStats.usedInQuestions > 0
                            ? '<span class="used-badge">🎯 Utilizado</span>'
                            : ''
                    }
                </div>
            </div>
            <div class="article-details">
                <p class="article-subject"><strong>Assunto:</strong> ${
                    article.subject
                }</p>
                <p class="article-law"><strong>Lei:</strong> ${article.law}</p>
                ${usageInfo}
                ${
                    article.fullText
                        ? `<p class="article-text">${article.fullText.substring(
                              0,
                              150
                          )}${article.fullText.length > 150 ? '...' : ''}</p>`
                        : ''
                }
                ${
                    article.context
                        ? `<p class="article-context"><em>${article.context}</em></p>`
                        : ''
                }
            </div>
            <div class="article-actions">
                <button class="btn btn-secondary read-article-btn" data-article-id="${
                    article.id
                }" data-track="${chunk.file}">
                    Ler art.
                </button>
            </div>
        </div>
    `;
}

// Função para renderizar artigos favoritos
// Substitua a função renderFavoriteArticles inteira por esta:

function renderFavoriteArticles(chunkId, articles) {
    const favoriteList = document.getElementById(`favorite-list-${chunkId}`);
    const chunk = lexiaChunks.find((c) => c.id === chunkId); // Precisamos do chunk para o data-track

    if (!favoriteList || !chunk) {
        console.warn(
            `Elemento favorite-list-${chunkId} ou chunk correspondente não encontrado`
        );
        return;
    }

    const favoriteArticles = articles.filter((article) =>
        isArticleFavorite(article.id)
    );

    if (favoriteArticles.length === 0) {
        favoriteList.innerHTML =
            '<p class="no-favorites">Nenhum artigo favorito nesta seção.</p>';
        return;
    }

    // Agora, usamos a mesma função de renderização da lista principal
    favoriteList.innerHTML = favoriteArticles
        .map((article) => {
            const stats = getArticleStats(article.id);
            // O segundo parâmetro (chunk) é necessário para o data-track do botão "Ler art."
            // O terceiro (stats) para as estatísticas e o quarto (isFavorite) é sempre true aqui.
            return createArticleItemHTML(article, chunk, stats, true);
        })
        .join('');
}

// Inicializar dados dos artigos
initializeArticleData();

// --- Global Persistence Functions --- //
function saveConfig() {
    localStorage.setItem('lexia_config', JSON.stringify(lexiaConfig));
}

function saveChunks() {
    // Ensure legal articles are included in the saved chunks
    const chunksWithArticles = lexiaChunks.map((chunk) => ({
        ...chunk,
        legalArticles: chunk.legalArticles || [],
    }));
    localStorage.setItem('lexia_chunks', JSON.stringify(chunksWithArticles));
    console.log('Chunks salvos com artigos de lei:', chunksWithArticles.length);
}

function saveFlashcards() {
    localStorage.setItem('lexia_flashcards', JSON.stringify(lexiaFlashcards));
    console.log('Flashcards salvos:', lexiaFlashcards.length);
}

function saveProgress() {
    localStorage.setItem('lexia_progress', JSON.stringify(lexiaProgress));
}

function saveEmbeddings() {
    localStorage.setItem('lexia_embeddings', JSON.stringify(lexiaEmbeddings));
}

function saveChatHistory() {
    localStorage.setItem('lexia_chat_history', JSON.stringify(chatHistory));
}

// ADICIONAR ESTAS FUNÇÕES AUXILIARES:
function getTrackMetadata(fileName) {
    const tracksMetadata =
        JSON.parse(localStorage.getItem('lexia_tracks_metadata')) || {};
    return (
        tracksMetadata[fileName] || {
            displayName: fileName,
            isFavorite: false,
            isArchived: false,
            createdAt: new Date().toISOString(),
            articleCount: 0,
        }
    );
}

function saveTrackMetadata(fileName, metadata) {
    const tracksMetadata =
        JSON.parse(localStorage.getItem('lexia_tracks_metadata')) || {};
    tracksMetadata[fileName] = {
        ...getTrackMetadata(fileName),
        ...metadata,
    };
    localStorage.setItem(
        'lexia_tracks_metadata',
        JSON.stringify(tracksMetadata)
    );
}

function getArticlesCount(fileName) {
    const fileChunks = lexiaChunks.filter((chunk) => chunk.file === fileName);
    return fileChunks.reduce(
        (total, chunk) => total + (chunk.legalArticles?.length || 0),
        0
    );
}

// app.js - Verifique se sua função deleteTrack está completa

function deleteTrack(fileName) {
    console.log(`[Delete] Iniciando exclusão da trilha: ${fileName}`);

    // 1. Remover chunks associados ao arquivo
    const initialChunkCount = lexiaChunks.length;
    lexiaChunks = lexiaChunks.filter((chunk) => chunk.file !== fileName);
    console.log(
        `[Delete] Chunks removidos: ${initialChunkCount - lexiaChunks.length}`
    );

    // 2. Remover flashcards associados à trilha (IMPORTANTE)
    const initialFlashcardCount = lexiaFlashcards.length;
    lexiaFlashcards = lexiaFlashcards.filter(
        (card) => (card.sourceTrack || 'Geral') !== fileName
    );
    console.log(
        `[Delete] Flashcards removidos: ${
            initialFlashcardCount - lexiaFlashcards.length
        }`
    );

    // 3. Remover metadados da trilha
    const tracksMetadata =
        JSON.parse(localStorage.getItem('lexia_tracks_metadata')) || {};
    if (tracksMetadata[fileName]) {
        delete tracksMetadata[fileName];
        localStorage.setItem(
            'lexia_tracks_metadata',
            JSON.stringify(tracksMetadata)
        );
        console.log(`[Delete] Metadados removidos para: ${fileName}`);
    } else {
        console.warn(`[Delete] Metadados não encontrados para: ${fileName}`);
    }

    // 4. Remover estatísticas de artigos associados (Opcional, mas recomendado)
    const articleStats =
        JSON.parse(localStorage.getItem('lexia_article_stats')) || {};
    let statsRemovedCount = 0;
    Object.keys(articleStats).forEach((articleId) => {
        // Assume que o ID do artigo contém o nome do arquivo (ajuste se necessário)
        if (articleId.includes(fileName.replace(/[^a-zA-Z0-9]/g, '_'))) {
            delete articleStats[articleId];
            statsRemovedCount++;
        }
    });
    if (statsRemovedCount > 0) {
        localStorage.setItem(
            'lexia_article_stats',
            JSON.stringify(articleStats)
        );
        console.log(
            `[Delete] Estatísticas de ${statsRemovedCount} artigos removidas.`
        );
    }

    // 5. Remover artigos favoritos associados (Opcional)
    let favorites =
        JSON.parse(localStorage.getItem('lexia_article_favorites')) || [];
    const initialFavCount = favorites.length;
    favorites = favorites.filter(
        (articleId) =>
            !articleId.includes(fileName.replace(/[^a-zA-Z0-9]/g, '_'))
    );
    if (favorites.length < initialFavCount) {
        localStorage.setItem(
            'lexia_article_favorites',
            JSON.stringify(favorites)
        );
        console.log(
            `[Delete] Favoritos de ${
                initialFavCount - favorites.length
            } artigos removidos.`
        );
    }

    // 6. Salvar as alterações nos arrays principais
    saveChunks();
    saveFlashcards(); // Salva a lista de flashcards atualizada

    // 7. Atualizar o dashboard (opcional, mas bom para consistência)
    updateDashboard();

    console.log(`[Delete] Exclusão completa para: ${fileName}`);
    // A função renderDisciplineBlocks() será chamada DEPOIS desta função, no listener do modal.
}

document.addEventListener('DOMContentLoaded', () => {
    const pdfUpload = document.getElementById('pdf-upload');
    const processPdfsButton = document.getElementById('process-pdfs');
    const disciplineBlocks = document.getElementById('discipline-blocks');
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat');
    const chatMessages = document.getElementById('chat-messages');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const saveApiKeyButton = document.getElementById('save-api-key');
    const exportDataButton = document.getElementById('export-data');
    const importDataInput = document.getElementById('import-data');
    const importDataButton = document.getElementById('import-data-button');

    // --- UI Navigation --- //
    document.querySelectorAll('#sidebar nav ul li a').forEach((link) => {
        link.addEventListener('click', function (event) {
            event.preventDefault();
            document.querySelectorAll('section').forEach((section) => {
                section.classList.remove('active-section');
            });
            document
                .querySelectorAll('#sidebar nav ul li a')
                .forEach((navLink) => {
                    navLink.classList.remove('active');
                });
            const targetId = this.getAttribute('href').substring(1);
            document.getElementById(targetId).classList.add('active-section');
            this.classList.add('active');

            // Load specific content based on section
            if (targetId === 'dashboard') {
                updateDashboard();
            } else if (targetId === 'study-track') {
                renderDisciplineBlocks();
            } else if (targetId === 'flashcards') {
                renderFlashcards();
            } else if (targetId === 'quiz') {
                renderQuiz();
                // ===== NOVO: Condição para Mapas Mentais =====
            } else if (targetId === 'mindmaps') {
                renderMindMapsSection(); // Chama a nova função de renderização
                // ============================================
            } else if (targetId === 'chat') {
                renderChatInterface(); // <-- CORREÇÃO
            }
        });
    });

    // --- Theme Switch --- //
    // MANTENHO APENAS ESTA DECLARAÇÃO DO themeSwitch
    const themeSwitch = document.getElementById('theme-switch');
    if (themeSwitch) {
        if (lexiaConfig.darkMode) {
            document.body.classList.add('dark-mode');
            themeSwitch.checked = true;
        }
        themeSwitch.addEventListener('change', () => {
            document.body.classList.toggle('dark-mode', themeSwitch.checked);
            lexiaConfig.darkMode = themeSwitch.checked;
            saveConfig();
        });
    } else {
        console.warn('Elemento theme-switch não encontrado');
    }

    // ===== NOVO: Carregar e higienizar mapas mentais =====
    lexiaMindMaps = (JSON.parse(localStorage.getItem('lexia_mind_maps')) || [])
        .map((map) => {
            if (!map || typeof map !== 'object' || !map.id || !map.mapData) {
                console.warn(
                    '[MindMap] Entrada de mapa mental inválida removida:',
                    map
                );
                return null; // Remove item inválido
            }
            // Garante estrutura mínima
            return {
                id: map.id,
                articleId: map.articleId || '',
                articleReference: map.articleReference || 'Artigo Desconhecido',
                sourceTrack: map.sourceTrack || 'Geral',
                mapData: map.mapData, // Essencial
                difficultyLevel: map.difficultyLevel || null,
                isFavorite: !!map.isFavorite,
                isArchived: !!map.isArchived,
                customName: map.customName || '',
                created: map.created || new Date().toISOString(),
                // Adicionar outras propriedades se necessário (viewCount, lastReviewed?)
            };
        })
        .filter(Boolean); // Remove os nulos
    saveMindMaps(); // Salva a versão higienizada
    console.log(
        '[MindMap] Mapas mentais carregados e higienizados:',
        lexiaMindMaps.length
    );
    // ==================================================

    // --- LocalStorage Management (functions moved to global scope) --- //

    // --- PDF Processing --- //
    pdfUpload.addEventListener('change', (event) => {
        uploadedPdfs = Array.from(event.target.files);
        console.log(
            'PDFs selecionados:',
            uploadedPdfs.map((f) => f.name)
        );

        // ===== ADICIONE ESTA LINHA ABAIXO =====
        updateSelectedFilesDisplay(uploadedPdfs); // Atualiza a UI com os nomes
        // =====================================
    });

    // ===== ADICIONE ESTA NOVA FUNÇÃO (pode ser logo após o listener acima) =====
    /**
     * Atualiza o elemento #pdf-file-list para mostrar os nomes dos arquivos selecionados.
     * @param {FileList|Array<File>} files - Os arquivos selecionados.
     */
    function updateSelectedFilesDisplay(files) {
        const fileListDisplay = document.getElementById('pdf-file-list');
        if (!fileListDisplay) return;

        if (!files || files.length === 0) {
            fileListDisplay.textContent = 'Nenhum arquivo selecionado';
        } else if (files.length === 1) {
            fileListDisplay.textContent = files[0].name;
            fileListDisplay.title = files[0].name; // Adiciona tooltip para nome completo
        } else {
            fileListDisplay.textContent = `${files.length} arquivos selecionados`;
            // Adiciona tooltip com a lista de nomes
            fileListDisplay.title = Array.from(files)
                .map((f) => f.name)
                .join('\n');
        }
    }
    // =========================================================================

    processPdfsButton.addEventListener('click', async () => {
        if (uploadedPdfs.length === 0) {
            alert('Por favor, selecione os arquivos PDF primeiro.');
            return;
        }

        // Mostrar indicador de carregamento
        const originalButtonText = processPdfsButton.textContent;
        processPdfsButton.textContent = 'Processando...';
        processPdfsButton.disabled = true;

        // Remover chunks já existentes para evitar duplicação
        const processedFileNames = new Set(uploadedPdfs.map((f) => f.name));
        lexiaChunks = lexiaChunks.filter(
            (chunk) => !processedFileNames.has(chunk.file)
        );

        for (const pdfFile of uploadedPdfs) {
            console.log(
                `Processando ${pdfFile.name} como um documento único...`
            );

            try {
                const arrayBuffer = await pdfFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer })
                    .promise;
                const numPages = pdf.numPages;
                let fullText = '';

                // Concatenar texto de todas as páginas
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items
                        .map((item) => item.str)
                        .join(' ');
                    fullText += pageText + '\n\n'; // Separar páginas com quebras de linha
                }

                // Limpar espaços e caracteres de controle desnecessários
                fullText = fullText.replace(/\s{2,}/g, ' ').replace(/\f/g, '');

                const chunkId = `chunk-${pdfFile.name.replace(
                    /[^a-zA-Z0-9]/g,
                    '_'
                )}-full`;
                let legalArticles = [];

                try {
                    console.log(
                        `Iniciando extração de artigos para ${pdfFile.name}...`
                    );
                    legalArticles = await extractLegalArticles(
                        fullText,
                        pdfFile.name
                    );
                    console.log(
                        `Foram extraídos ${legalArticles.length} artigos de ${pdfFile.name}`
                    );
                } catch (error) {
                    console.error(
                        `Erro na extração de artigos para ${pdfFile.name}:`,
                        error
                    );
                    legalArticles = []; // fallback se a IA falhar
                }

                // Criar chunk único para o arquivo
                lexiaChunks.push({
                    id: chunkId,
                    file: pdfFile.name,
                    page: `1-${numPages}`,
                    text: fullText, // texto completo para contexto
                    summary: '',
                    flashcard: { question: '', answer: '' },
                    embeddings: [],
                    legalArticles: legalArticles || [],
                });

                // Salvar metadados de acompanhamento (posição correta)
                saveTrackMetadata(pdfFile.name, {
                    articleCount: legalArticles.length,
                });

                console.log(`Processamento de ${pdfFile.name} concluído.`);
            } catch (error) {
                console.error(`Erro ao processar ${pdfFile.name}:`, error);
                alert(
                    `Erro ao processar ${pdfFile.name}. Verifique se o arquivo é um PDF válido.`
                );
            }
        }

        // Salvar chunks e atualizar interface
        saveChunks();
        alert(
            `PDFs processados! ${lexiaChunks.length} documentos extraídos com sucesso.`
        );
        renderDisciplineBlocks();
        updateDashboard();

        // Restaurar estado do botão
        processPdfsButton.textContent = originalButtonText;
        processPdfsButton.disabled = false;
    });

    // --- Render Discipline Blocks --- //
    function renderDisciplineBlocks() {
        const disciplineBlocks = document.getElementById('discipline-blocks');

        // Obter trilhas únicas com metadados
        const uniqueFiles = [
            ...new Set(lexiaChunks.map((chunk) => chunk.file)),
        ];
        const tracks = uniqueFiles.map((file) => {
            const metadata = getTrackMetadata(file);
            const fileChunks = lexiaChunks.filter(
                (chunk) => chunk.file === file
            );
            const articlesCount = getArticlesCount(file);

            // Atualizar contagem de artigos se necessário
            if (metadata.articleCount !== articlesCount) {
                saveTrackMetadata(file, { articleCount: articlesCount });
            }

            return {
                fileName: file,
                displayName: metadata.displayName,
                isFavorite: metadata.isFavorite,
                isArchived: metadata.isArchived,
                createdAt: metadata.createdAt,
                pages: fileChunks.length,
                articlesCount: articlesCount,
                chunks: fileChunks,
            };
        });

        // Separar trilhas favoritas e normais
        const favoriteTracks = tracks.filter(
            (track) => track.isFavorite && !track.isArchived
        );
        const normalTracks = tracks.filter(
            (track) => !track.isFavorite && !track.isArchived
        );
        const archivedTracks = tracks.filter((track) => track.isArchived);

        // Aplicar filtros
        const filter = document.getElementById('track-filter')?.value || 'name';
        const sortedTracks = sortTracks([...normalTracks], filter);
        const sortedFavorites = sortTracks([...favoriteTracks], filter);

        disciplineBlocks.innerHTML = `
        <div class="tracks-header">
            <div class="tracks-controls">
                <div class="filter-section">
                    <label for="track-filter">Filtrar por:</label>
                    <select id="track-filter" class="filter-select">
                        <option value="name">Nome</option>
                        <option value="recent">Mais Recentes</option>
                        <option value="oldest">Mais Antigos</option>
                        <option value="most-articles">Mais Artigos</option>
                        <option value="least-articles">Menos Artigos</option>
                    </select>
                </div>
            </div>
        </div>

        ${
            favoriteTracks.length > 0
                ? `
        <div class="favorites-section">
            <h3 class="section-title">⭐ Trilhas Favoritas</h3>
            <div class="tracks-grid favorites-grid">
                ${sortedFavorites
                    .map((track) => createTrackCard(track))
                    .join('')}
            </div>
        </div>
        `
                : ''
        }

        <div class="all-tracks-section">
            <h3 class="section-title">Todas as Trilhas</h3>
            ${
                normalTracks.length > 0
                    ? `
            <div class="tracks-grid">
                ${sortedTracks.map((track) => createTrackCard(track)).join('')}
            </div>
            `
                    : '<p class="no-tracks">Nenhuma trilha disponível. Carregue PDFs para começar.</p>'
            }
        </div>

        ${
            archivedTracks.length > 0
                ? `
        <div class="archived-section">
            <details>
                <summary class="section-title">📁 Trilhas Arquivadas (${
                    archivedTracks.length
                })</summary>
                <div class="tracks-grid archived-grid">
                    ${archivedTracks
                        .map((track) => createTrackCard(track))
                        .join('')}
                </div>
            </details>
        </div>
        `
                : ''
        }
    `;

        // Adicionar event listeners para os filtros
        const filterSelect = document.getElementById('track-filter');
        if (filterSelect) {
            filterSelect.addEventListener('change', renderDisciplineBlocks);
        }

        // Adicionar event listeners para os botões das trilhas
        addTrackEventListeners();
    }

    function sortTracks(tracks, filter) {
        switch (filter) {
            case 'name':
                return tracks.sort((a, b) =>
                    a.displayName.localeCompare(b.displayName)
                );
            case 'recent':
                return tracks.sort(
                    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
                );
            case 'oldest':
                return tracks.sort(
                    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
                );
            case 'most-articles':
                return tracks.sort((a, b) => b.articlesCount - a.articlesCount);
            case 'least-articles':
                return tracks.sort((a, b) => a.articlesCount - b.articlesCount);
            default:
                return tracks;
        }
    }

    function createTrackCard(track) {
        return `
        <div class="track-card ${track.isFavorite ? 'favorite' : ''} ${
            track.isArchived ? 'archived' : ''
        }">
            <div class="track-header">
                <h3 class="track-title">${track.displayName}</h3>
                <div class="track-actions">
                    <button class="track-action-btn favorite-btn" data-file="${
                        track.fileName
                    }" title="${
            track.isFavorite ? 'Desfavoritar' : 'Favoritar'
        }">
                        ${track.isFavorite ? '⭐' : '☆'}
                    </button>
                    <button class="track-action-btn edit-btn" data-file="${
                        track.fileName
                    }" title="Editar nome">✏️</button>
                    <button class="track-action-btn archive-btn" data-file="${
                        track.fileName
                    }" title="${track.isArchived ? 'Desarquivar' : 'Arquivar'}">
                        ${track.isArchived ? '📂' : '📁'}
                    </button>
                    <button class="track-action-btn delete-btn" data-file="${
                        track.fileName
                    }" title="Excluir trilha">🗑️</button>
                </div>
            </div>
            
            <div class="track-stats">
                <div class="track-stat">
                    <span class="stat-icon">📄</span>
                    <span class="stat-text">${track.pages} páginas</span>
                </div>
                <div class="track-stat">
                    <span class="stat-icon">⚖️</span>
                    <span class="stat-text">${
                        track.articlesCount
                    } artigos</span>
                </div>
            </div>
            
            <div class="track-footer">
                <button class="btn btn-primary view-content-btn" data-file="${
                    track.fileName
                }">
                    Ver Conteúdo
                </button>
            </div>
        </div>
    `;
    }

    function addTrackEventListeners() {
        // Botão de favoritar
        document.querySelectorAll('.favorite-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const fileName = e.target.closest('.favorite-btn').dataset.file;
                const metadata = getTrackMetadata(fileName);
                saveTrackMetadata(fileName, {
                    isFavorite: !metadata.isFavorite,
                });
                renderDisciplineBlocks();
            });
        });

        // Botão de editar
        document.querySelectorAll('.edit-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const fileName = e.target.closest('.edit-btn').dataset.file;
                const metadata = getTrackMetadata(fileName);
                const newName = prompt(
                    'Digite o novo nome para a trilha:',
                    metadata.displayName
                );
                if (newName && newName.trim() !== '') {
                    saveTrackMetadata(fileName, {
                        displayName: newName.trim(),
                    });
                    renderDisciplineBlocks();
                }
            });
        });

        // Botão de arquivar
        document.querySelectorAll('.archive-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const fileName = e.target.closest('.archive-btn').dataset.file;
                const metadata = getTrackMetadata(fileName);
                saveTrackMetadata(fileName, {
                    isArchived: !metadata.isArchived,
                });
                renderDisciplineBlocks();
            });
        });

        // Botão de excluir
        document.querySelectorAll('.delete-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const fileName = e.target.closest('.delete-btn').dataset.file;
                const metadata = getTrackMetadata(fileName);
                showDeleteConfirmation(fileName, metadata.displayName);
            });
        });

        // Botão de ver conteúdo
        document.querySelectorAll('.view-content-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const fileName = e.target.dataset.file;
                renderReadingTopic(fileName);
            });
        });
    }

    // app.js - SUBSTITUA a função showDeleteConfirmation existente por esta

    function showDeleteConfirmation(fileName, displayName) {
        // Cria o overlay do modal (sem alterações aqui)
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
        <div class="modal-content confirmation-modal">
            <h3>Confirmar Exclusão</h3>
            <div class="confirmation-message">
                <p>Tem certeza que deseja excluir permanentemente a trilha <strong>"${displayName}"</strong>?</p>
                <p class="warning-text">⚠️ Esta ação removerá todos os chunks e flashcards associados a este PDF e não pode ser desfeita!</p>
            </div>
            <div class="confirmation-actions">
                <button class="btn btn-secondary" id="cancel-delete">Cancelar</button>
                <button class="btn btn-error" id="confirm-delete">Sim, Excluir</button>
            </div>
        </div>
    `;

        document.body.appendChild(modal);

        // Listener do botão Cancelar (sem alterações)
        const cancelBtn = document.getElementById('cancel-delete');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (modal.parentNode) {
                    // Verifica se o modal ainda está no DOM
                    document.body.removeChild(modal);
                }
            });
        }

        // ===== CORREÇÃO APLICADA AQUI =====
        // Listener do botão Confirmar Exclusão
        const confirmBtn = document.getElementById('confirm-delete');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                console.log(`[Delete] Confirmada exclusão para: ${fileName}`);

                // 1. Chama a função que realmente deleta os dados
                deleteTrack(fileName); // (Certifique-se que esta função remove chunks, flashcards e metadados)

                // 2. Remove o modal da tela
                if (modal.parentNode) {
                    // Verifica se o modal ainda está no DOM
                    document.body.removeChild(modal);
                    console.log('[Delete] Modal removido.');
                }

                // 3. **CHAMA A FUNÇÃO PARA RENDERIZAR NOVAMENTE A LISTA DE TRILHAS**
                renderDisciplineBlocks(); // <-- Esta linha atualiza a interface imediatamente!
                console.log(
                    '[Delete] Chamando renderDisciplineBlocks para atualizar a lista.'
                );

                // 4. (Opcional) Mostrar notificação de sucesso
                showToast(
                    `Trilha "${displayName}" excluída com sucesso.`,
                    3000
                ); // Se você tiver a função showToast
            });
        }

        // Fechar ao clicar fora (opcional, sem alterações)
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                if (modal.parentNode) {
                    document.body.removeChild(modal);
                }
            }
        });
    }

    // --- Legal Articles Helper Functions --- //
    function updateArticleSelectionButtons(chunkId) {
        const checkboxes = document.querySelectorAll(
            `input[data-chunk-id="${chunkId}"].article-checkbox`
        );
        const selectedCount = Array.from(checkboxes).filter(
            (cb) => cb.checked
        ).length;
        const generateButton = document.querySelector(
            `.generate-from-articles[data-chunk-id="${chunkId}"]`
        );

        if (generateButton) {
            generateButton.disabled = selectedCount === 0;
            generateButton.textContent =
                selectedCount > 0
                    ? `Gerar Flashcards/Quiz (${selectedCount} selecionados)`
                    : 'Gerar Flashcards/Quiz dos Selecionados';
        }
    }

    async function reExtractArticles(chunkId) {
        const chunk = lexiaChunks.find((c) => c.id === chunkId);
        if (!chunk) return;

        const button = document.querySelector(
            `.re-extract-articles[data-chunk-id="${chunkId}"]`
        );
        const originalText = button.textContent;
        button.textContent = 'Extraindo...';
        button.disabled = true;

        try {
            const legalArticles = await extractLegalArticles(
                chunk.text,
                chunk.file
            );
            chunk.legalArticles = legalArticles;
            saveChunks();

            // Re-render the current topic to show updated articles
            const fileName = chunk.file;
            renderReadingTopic(fileName);

            alert(
                `Extração concluída! ${legalArticles.length} artigos encontrados.`
            );
        } catch (error) {
            console.error('Erro ao re-extrair artigos:', error);
            alert('Erro ao extrair artigos. Tente novamente.');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    async function showArticleGenerationModal(chunkId) {
        const chunk = lexiaChunks.find((c) => c.id === chunkId);
        if (!chunk) return;

        const checkboxes = document.querySelectorAll(
            `input[data-chunk-id="${chunkId}"].article-checkbox:checked`
        );
        const selectedArticles = Array.from(checkboxes)
            .map((cb) => {
                const articleNumber = cb.dataset.articleNumber;
                return chunk.legalArticles.find(
                    (article) => article.number === articleNumber
                );
            })
            .filter(Boolean);

        if (selectedArticles.length === 0) {
            alert('Selecione pelo menos um artigo de lei.');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content article-generation-modal">
                <h3>⚖️ Gerar Conteúdo dos Artigos Selecionados</h3>
                
                <div class="selected-articles-summary">
                    <h4>Artigos Selecionados (${selectedArticles.length}):</h4>
                    <ul>
                        ${selectedArticles
                            .map(
                                (article) => `
                            <li><strong>${article.fullReference}</strong> - ${article.subject}</li>
                        `
                            )
                            .join('')}
                    </ul>
                </div>
                
                <div class="generation-options">
                    <h4>Opções de Geração:</h4>
                    
                    <div class="option-group">
                        <label>
                            <input type="checkbox" id="generate-flashcards" checked>
                            Gerar Flashcards (um para cada artigo)
                        </label>
                    </div>
                    
                    <div class="option-group">
                        <label>
                            <input type="checkbox" id="generate-quiz" checked>
                            Gerar Questões de Quiz (baseadas nos artigos)
                        </label>
                    </div>
                    
                    <div class="option-group">
                        <label for="quiz-quantity">Quantidade de questões por artigo:</label>
                        <select id="quiz-quantity">
                            <option value="1">1 questão</option>
                            <option value="2" selected>2 questões</option>
                            <option value="3">3 questões</option>
                        </select>
                    </div>
                    
                    <div class="option-group">
                        <label for="content-focus">Foco do conteúdo:</label>
                        <select id="content-focus">
                            <option value="complete">Artigo completo</option>
                            <option value="definition">Definições e conceitos</option>
                            <option value="penalties">Penas e sanções</option>
                            <option value="procedures">Procedimentos</option>
                            <option value="exceptions">Exceções e casos especiais</option>
                        </select>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="cancel-generation">Cancelar</button>
                    <button class="btn btn-primary" id="start-generation">Iniciar Geração</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document
            .getElementById('cancel-generation')
            .addEventListener('click', () => {
                document.body.removeChild(modal);
            });

        document
            .getElementById('start-generation')
            .addEventListener('click', async () => {
                const generateFlashcards = document.getElementById(
                    'generate-flashcards'
                ).checked;
                const generateQuiz =
                    document.getElementById('generate-quiz').checked;
                const quizQuantity = parseInt(
                    document.getElementById('quiz-quantity').value
                );
                const contentFocus =
                    document.getElementById('content-focus').value;

                if (!generateFlashcards && !generateQuiz) {
                    alert('Selecione pelo menos uma opção de geração.');
                    return;
                }

                document.body.removeChild(modal);
                await generateContentFromArticles(selectedArticles, {
                    generateFlashcards,
                    generateQuiz,
                    quizQuantity,
                    contentFocus,
                    chunkId,
                });
            });
    }

    async function generateContentFromArticles(selectedArticles, options) {
        const {
            generateFlashcards,
            generateQuiz,
            quizQuantity,
            contentFocus,
            chunkId,
        } = options;

        // Show progress
        const progressModal = document.createElement('div');
        progressModal.className = 'modal-overlay';
        progressModal.innerHTML = `
            <div class="modal-content">
                <h3>🔄 Gerando Conteúdo...</h3>
                <div class="progress-info">
                    <p id="progress-text">Preparando...</p>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(progressModal);

        const updateProgress = (text, percent) => {
            document.getElementById('progress-text').textContent = text;
            document.getElementById(
                'progress-fill'
            ).style.width = `${percent}%`;
        };

        try {
            let totalTasks = 0;
            let completedTasks = 0;

            if (generateFlashcards) totalTasks += selectedArticles.length;
            if (generateQuiz)
                totalTasks += selectedArticles.length * quizQuantity;

            // Generate flashcards
            if (generateFlashcards) {
                for (const article of selectedArticles) {
                    updateProgress(
                        `Gerando flashcard para ${article.fullReference}...`,
                        (completedTasks / totalTasks) * 100
                    );
                    await generateFlashcardFromArticle(article, contentFocus);
                    completedTasks++;
                }
            }

            // Generate quiz questions
            if (generateQuiz) {
                for (const article of selectedArticles) {
                    for (let i = 0; i < quizQuantity; i++) {
                        updateProgress(
                            `Gerando questão ${i + 1} para ${
                                article.fullReference
                            }...`,
                            (completedTasks / totalTasks) * 100
                        );
                        await generateQuizFromArticle(
                            article,
                            contentFocus,
                            i + 1
                        );
                        completedTasks++;
                    }
                }
            }

            updateProgress('Concluído!', 100);

            setTimeout(() => {
                document.body.removeChild(progressModal);

                const flashcardCount = generateFlashcards
                    ? selectedArticles.length
                    : 0;
                const questionCount = generateQuiz
                    ? selectedArticles.length * quizQuantity
                    : 0;

                const message =
                    `Geração concluída com sucesso!\n\n` +
                    `✅ ${flashcardCount} flashcards criados\n` +
                    `✅ ${questionCount} questões criadas\n\n` +
                    `O conteúdo foi salvo automaticamente.\n` +
                    `Deseja navegar para uma das seções?`;

                if (confirm(message)) {
                    if (
                        generateFlashcards &&
                        confirm('Ir para a seção de Flashcards?')
                    ) {
                        document
                            .querySelectorAll('section')
                            .forEach((section) => {
                                section.classList.remove('active-section');
                            });
                        document
                            .getElementById('flashcards')
                            .classList.add('active-section');
                        renderFlashcards();
                    } else if (
                        generateQuiz &&
                        confirm('Ir para a seção de Quiz?')
                    ) {
                        document
                            .querySelectorAll('section')
                            .forEach((section) => {
                                section.classList.remove('active-section');
                            });
                        document
                            .getElementById('quiz')
                            .classList.add('active-section');
                        renderQuiz();
                    }
                }

                updateDashboard();
            }, 1000);
        } catch (error) {
            console.error('Erro na geração de conteúdo:', error);
            document.body.removeChild(progressModal);
            alert('Erro durante a geração. Tente novamente.');
        }
    }

    // SUBSTITUA A FUNÇÃO 'renderReadingTopic' INTEIRA POR ESTA
    function renderReadingTopic(fileName) {
        document.querySelectorAll('section').forEach((section) => {
            section.classList.remove('active-section');
        });
        document
            .getElementById('reading-topic')
            .classList.add('active-section');

        const fileChunks = lexiaChunks.filter(
            (chunk) => chunk.file === fileName
        );
        let currentPage = 0;
        const chunksPerPage = 3;

        function renderPage(page) {
            const startIndex = page * chunksPerPage;
            const endIndex = Math.min(
                startIndex + chunksPerPage,
                fileChunks.length
            );
            const pageChunks = fileChunks.slice(startIndex, endIndex);

            document.getElementById('topic-content').innerHTML = `
            <div class="topic-header">
                <div class="topic-header-top">
                    <button id="back-button" class="btn btn-secondary">
                        ← Voltar para Trilha de Estudo
                    </button>
                    <div class="topic-stats">
                        <span>Total de seções: ${fileChunks.length}</span>
                        <span>Página ${page + 1} de ${Math.ceil(
                fileChunks.length / chunksPerPage
            )}</span>
                    </div>
                </div>
                <h2>${getTrackMetadata(fileName).displayName}</h2>
            </div>
            <div class="chunks-grid">
                ${pageChunks
                    .map(
                        (chunk) => `
                        <div class="chunk-card" data-chunk-id="${chunk.id}">
                            <div class="chunk-header">
                                <h4>Páginas ${chunk.page}</h4>
                                <div class="chunk-actions">
                                    <button data-chunk-id="${
                                        chunk.id
                                    }" class="btn-icon show-articles-btn" title="Ver Artigos de Lei">⚖️</button>
                                </div>
                            </div>
                            <div class="chunk-preview">
                                <p>${chunk.text.substring(0, 200)}${
                            chunk.text.length > 200 ? '...' : ''
                        }</p>
                            </div>
                            <div class="chunk-expanded" style="display: none;">
                                <p>${chunk.text}</p>
                            </div>
                            
                            <div class="legal-articles-section" id="articles-${
                                chunk.id
                            }" style="display: none;">
                                <h5>📋 Artigos de Lei Identificados (${
                                    chunk.legalArticles
                                        ? chunk.legalArticles.length
                                        : 0
                                })</h5>
                                
                                <div class="favorite-articles-section" id="favorites-${
                                    chunk.id
                                }">
                                    <h6>⭐ Artigos Favoritos</h6>
                                    <div class="favorite-articles-list" id="favorite-list-${
                                        chunk.id
                                    }">
                                        </div>
                                </div>
                                
                                ${
                                    chunk.legalArticles &&
                                    chunk.legalArticles.length > 0
                                        ? `
                                    <div class="articles-list">
                                        ${chunk.legalArticles
                                            .map((article) => {
                                                const articleStats =
                                                    getArticleStats(article.id);
                                                const isFavorite =
                                                    isArticleFavorite(
                                                        article.id
                                                    );
                                                // Utiliza a nova função "molde" para renderizar o card
                                                return createArticleItemHTML(
                                                    article,
                                                    chunk,
                                                    articleStats,
                                                    isFavorite
                                                );
                                            })
                                            .join('')}
                                    </div>
                                    `
                                        : `
                                    <p class="no-articles">Nenhum artigo de lei identificado nesta seção.</p>
                                    <button class="btn btn-secondary re-extract-articles" data-chunk-id="${chunk.id}">
                                        Tentar Extrair Novamente
                                    </button>
                                `
                                }
                            </div>
                        </div>
                    `
                    )
                    .join('')}
            </div>
            <div class="pagination-controls">
                <button id="prev-page" ${
                    page === 0 ? 'disabled' : ''
                }>← Anterior</button>
                <span>Página ${page + 1} de ${Math.ceil(
                fileChunks.length / chunksPerPage
            )}</span>
                <button id="next-page" ${
                    endIndex >= fileChunks.length ? 'disabled' : ''
                }>Próxima →</button>
            </div>
        `;

            // Add event listeners (o código aqui permanece o mesmo)
            const backBtn = document.getElementById('back-button');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    // ... (lógica do botão voltar, já está correta)
                    document.querySelectorAll('section').forEach((section) => {
                        section.classList.remove('active-section');
                    });
                    document
                        .getElementById('study-track')
                        .classList.add('active-section');
                });
            }

            document
                .querySelectorAll('.show-articles-btn')
                .forEach((button) => {
                    button.addEventListener('click', (event) => {
                        // ... (lógica de mostrar/ocultar artigos, já está correta)
                        const chunkId =
                            event.target.closest('.show-articles-btn').dataset
                                .chunkId;
                        const articlesSection = document.getElementById(
                            `articles-${chunkId}`
                        );
                        const chunk = lexiaChunks.find((c) => c.id === chunkId);
                        if (
                            articlesSection &&
                            articlesSection.style.display === 'none'
                        ) {
                            articlesSection.style.display = 'block';
                            event.target.title = 'Ocultar Artigos';
                            if (chunk) {
                                renderFavoriteArticles(
                                    chunkId,
                                    chunk.legalArticles
                                );
                            }
                        } else if (articlesSection) {
                            articlesSection.style.display = 'none';
                            event.target.title = 'Ver Artigos de Lei';
                        }
                    });
                });

            document
                .querySelectorAll('.re-extract-articles')
                .forEach((button) => {
                    button.addEventListener('click', async (event) => {
                        const chunkId = event.target.dataset.chunkId;
                        await reExtractArticles(chunkId);
                    });
                });

            // Delegação de Eventos para os botões que são criados dinamicamente
            const topicContent = document.getElementById('topic-content');
            topicContent.addEventListener('click', function (e) {
                // 1. Botão de Favoritar
                const favoriteBtn = e.target.closest('.favorite-toggle');
                if (favoriteBtn) {
                    e.stopPropagation();
                    const articleId = favoriteBtn.dataset.articleId;
                    if (!articleId) return;

                    const wasAdded = toggleArticleFavorite(articleId);

                    // Atualiza a aparência de TODOS os botões e cards com o mesmo ID
                    document
                        .querySelectorAll(
                            `.favorite-toggle[data-article-id="${articleId}"]`
                        )
                        .forEach((btn) => {
                            btn.innerHTML = wasAdded ? '⭐' : '☆';
                            btn.title = wasAdded
                                ? 'Remover dos favoritos'
                                : 'Adicionar aos favoritos';
                        });
                    document
                        .querySelectorAll(
                            `.article-item[data-article-id="${articleId}"]`
                        )
                        .forEach((item) => {
                            item.classList.toggle('favorite', wasAdded);
                        });

                    // Re-renderiza a lista de favoritos para refletir a mudança
                    const articlesSection = favoriteBtn.closest(
                        '.legal-articles-section'
                    );
                    if (articlesSection) {
                        const chunkId = articlesSection.id.replace(
                            'articles-',
                            ''
                        );
                        const chunk = lexiaChunks.find((c) => c.id === chunkId);
                        if (chunk && chunk.legalArticles) {
                            renderFavoriteArticles(
                                chunkId,
                                chunk.legalArticles
                            );
                        }
                    }
                    return; // Finaliza a execução para este clique
                }

                // 2. Botão "Ler art."
                const readBtn = e.target.closest('.read-article-btn');
                if (readBtn) {
                    const articleId = readBtn.dataset.articleId;
                    const trackFileName = readBtn.dataset.track;
                    if (articleId && trackFileName) {
                        showArticleContentModal(articleId, trackFileName);
                    }
                    return; // Finaliza a execução para este clique
                }
            });

            // Pagination controls (código mantido como estava)
            const prevBtn = document.getElementById('prev-page');
            const nextBtn = document.getElementById('next-page');

            if (prevBtn && !prevBtn.disabled) {
                prevBtn.addEventListener('click', () => {
                    currentPage--;
                    renderPage(currentPage);
                });
            }
            if (nextBtn && !nextBtn.disabled) {
                nextBtn.addEventListener('click', () => {
                    currentPage++;
                    renderPage(currentPage);
                });
            }
        }
        renderPage(currentPage);
    }

    // --- Gemini API Key Management --- //
    if (lexiaConfig.geminiApiKey) {
        geminiApiKeyInput.value = lexiaConfig.geminiApiKey;
    }

    saveApiKeyButton.addEventListener('click', () => {
        lexiaConfig.geminiApiKey = geminiApiKeyInput.value;
        saveConfig();
        alert('Chave da API Gemini salva!');
    });

    // --- Data Export/Import --- //
    exportDataButton.addEventListener('click', () => {
        const data = {
            lexia_config: lexiaConfig,
            lexia_chunks: lexiaChunks,
            lexia_flashcards: lexiaFlashcards,
            lexia_progress: lexiaProgress,
            lexia_embeddings: lexiaEmbeddings,
        };
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lexia_backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    importDataInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (importedData.lexia_config)
                        lexiaConfig = importedData.lexia_config;
                    if (importedData.lexia_chunks)
                        lexiaChunks = importedData.lexia_chunks;
                    if (importedData.lexia_flashcards)
                        lexiaFlashcards = importedData.lexia_flashcards;
                    if (importedData.lexia_progress)
                        lexiaProgress = importedData.lexia_progress;
                    if (importedData.lexia_embeddings)
                        lexiaEmbeddings = importedData.lexia_embeddings;

                    saveConfig();
                    saveChunks();
                    saveFlashcards();
                    saveProgress();
                    saveEmbeddings();

                    alert('Dados importados com sucesso!');
                    location.reload(); // Reload to apply all changes
                } catch (e) {
                    alert('Erro ao importar dados: arquivo JSON inválido.');
                    console.error(e);
                }
            };
            reader.readAsText(file);
        }
    });

    // --- Event Listeners --- //
    // Add event listener for flashcards section
    document
        .querySelector('#sidebar nav ul li a[href="#flashcards"]')
        .addEventListener('click', () => {
            renderFlashcards();
        });

    // Add event listeners for chat
    sendChatButton.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    // Load chat history when chat section is accessed
    document
        .querySelector('#sidebar nav ul li a[href="#chat"]')
        .addEventListener('click', () => {
            setTimeout(loadChatHistory, 100);
        });

    // Initial setup
    if (lexiaChunks.length > 0) {
        renderDisciplineBlocks();
    }

    updateDashboard();

    // Set initial active section
    document.getElementById('dashboard').classList.add('active-section');
    document
        .querySelector('#sidebar nav ul li a[href="#dashboard"]')
        .classList.add('active');
});

// --- SM-2 Algorithm Implementation --- //
class SM2Algorithm {
    static calculateNextReview(quality, easiness, interval, repetitions) {
        let newEasiness = easiness;
        let newInterval = interval;
        let newRepetitions = repetitions;

        if (quality >= 3) {
            if (repetitions === 0) {
                newInterval = 1;
            } else if (repetitions === 1) {
                newInterval = 6;
            } else {
                newInterval = Math.round(interval * easiness);
            }
            newRepetitions = repetitions + 1;
        } else {
            newRepetitions = 0;
            newInterval = 1;
        }

        newEasiness =
            easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (newEasiness < 1.3) {
            newEasiness = 1.3;
        }

        return {
            easiness: newEasiness,
            interval: newInterval,
            repetitions: newRepetitions,
            nextReview: new Date(
                Date.now() + newInterval * 24 * 60 * 60 * 1000
            ),
        };
    }

    static createFlashcard(id, question, answer, chunkId) {
        return {
            id: id,
            question: question,
            answer: answer,
            chunkId: chunkId,
            easiness: 2.5,
            interval: 1,
            repetitions: 0,
            nextReview: new Date(),
            created: new Date(),
            lastReviewed: null,
        };
    }
}

// Adicionar em app.js

function updateFlashcardStats() {
    const statsContainer = document.querySelector('.flashcards-stats');
    if (!statsContainer) return;

    // Recalcula os totais com base no estado atual de lexiaFlashcards
    const total = lexiaFlashcards.filter((card) => !card.isArchived).length;
    const favorites = lexiaFlashcards.filter(
        (f) => f.isFavorite && !f.isArchived
    ).length;
    const archived = lexiaFlashcards.filter((f) => f.isArchived).length;

    statsContainer.innerHTML = `
        <span class="stat">Total: ${total}</span>
        <span class="stat">Favoritos: ${favorites}</span>
        <span class="stat">Arquivados: ${archived}</span>
    `;
}

// Adicione esta nova função em app.js

// Adicione esta nova função em app.js

// Adicione esta função em app.js

// SUBSTITUA A FUNÇÃO handleStatisticalQuery INTEIRA POR ESTA:

function handleStatisticalQuery(query) {
    const lowerQuery = query.toLowerCase();

    // 1. Coleta de todos os dados necessários
    const stats = JSON.parse(localStorage.getItem('lexia_article_stats')) || {};
    const articlesWithStats = Object.entries(stats).map(([id, data]) => ({
        id,
        ...data,
    }));

    // Cria um mapa para busca rápida de referências de artigos
    const articleMap = new Map();
    lexiaChunks.forEach((chunk) => {
        (chunk.legalArticles || []).forEach((article) => {
            articleMap.set(article.id, article);
        });
    });

    // Função auxiliar para formatar a lista de artigos
    const formatTopArticles = (articleList, metricField, metricLabel) => {
        if (
            !articleList ||
            articleList.length === 0 ||
            articleList[0][metricField] === 0
        ) {
            return null; // Retorna null se não houver dados relevantes
        }
        let response = '';
        articleList.slice(0, 3).forEach((stat, index) => {
            const article = articleMap.get(stat.id);
            const ref = article ? article.fullReference : stat.id;
            response += `${index + 1}. **${ref}** - ${
                stat[metricField]
            } ${metricLabel}\n`;
        });
        return response;
    };

    // --- LÓGICA DE RESPOSTAS ---

    // PERGUNTA: Desempenho Geral
    if (
        lowerQuery.includes('desempenho geral') ||
        lowerQuery.includes('meu progresso') ||
        lowerQuery.includes('minhas estatísticas')
    ) {
        const totalQuizzes = quizManager.quizHistory.length;
        const totalQuestions = quizManager.quizHistory.reduce(
            (sum, quiz) => sum + quiz.questions.length,
            0
        );
        const correctAnswers = quizManager.quizHistory.reduce(
            (sum, quiz) => sum + quiz.score,
            0
        );
        const accuracy =
            totalQuestions > 0
                ? ((correctAnswers / totalQuestions) * 100).toFixed(1)
                : 0;
        const totalFlashcardsReviewed = lexiaFlashcards.reduce(
            (sum, card) => sum + (card.viewCount || 0),
            0
        );

        let response =
            'Claro! Aqui está um resumo do seu progresso na plataforma:\n\n';
        response += `* **Quizzes:** Você completou **${totalQuizzes}** quizzes, respondendo a um total de **${totalQuestions}** questões com uma precisão geral de **${accuracy}%**.\n`;
        response += `* **Flashcards:** Você realizou **${totalFlashcardsReviewed}** revisões de flashcards no total.\n`;
        response += `* **Artigos:** **${articlesWithStats.length}** artigos diferentes já foram abordados em seus quizzes.\n\n`;
        response +=
            'Continue com o ótimo trabalho! 💪 Se quiser detalhes sobre algum ponto, é só pedir.';
        return response;
    }

    // PERGUNTA: Artigos com mais erros
    if (
        lowerQuery.includes('mais errei') ||
        lowerQuery.includes('mais erro') ||
        lowerQuery.includes('piores artigos')
    ) {
        const sortedByErrors = articlesWithStats.sort(
            (a, b) => b.incorrectAnswers - a.incorrectAnswers
        );
        const topErrors = formatTopArticles(
            sortedByErrors,
            'incorrectAnswers',
            'erro(s)'
        );

        if (topErrors) {
            return (
                'Analisando seu desempenho, os artigos em que você mais cometeu erros em quizzes são:\n\n' +
                topErrors +
                '\nSeria uma boa ideia focar a revisão neles!'
            );
        }
        return 'Ótima notícia! Você ainda não errou nenhuma questão baseada em artigos. Continue assim! ✅';
    }

    // PERGUNTA: Artigos com mais acertos
    if (
        lowerQuery.includes('mais acertei') ||
        lowerQuery.includes('mais acerto') ||
        lowerQuery.includes('melhores artigos')
    ) {
        const sortedByCorrect = articlesWithStats.sort(
            (a, b) => b.correctAnswers - a.correctAnswers
        );
        const topCorrect = formatTopArticles(
            sortedByCorrect,
            'correctAnswers',
            'acerto(s)'
        );

        if (topCorrect) {
            return (
                'Parabéns! Seus melhores desempenhos em quizzes foram nos seguintes artigos:\n\n' +
                topCorrect
            );
        }
        return 'Ainda não há registros de acertos em questões de artigos. Continue praticando!';
    }

    // PERGUNTA: Artigos mais utilizados
    if (
        lowerQuery.includes('mais utilizados') ||
        lowerQuery.includes('mais cobrados') ||
        lowerQuery.includes('mais testados')
    ) {
        const sortedByUsage = articlesWithStats.sort(
            (a, b) => b.usedInQuestions - a.usedInQuestions
        );
        const topUsed = formatTopArticles(
            sortedByUsage,
            'usedInQuestions',
            'uso(s)'
        );

        if (topUsed) {
            return (
                'Os artigos que mais apareceram em seus quizzes até agora foram:\n\n' +
                topUsed
            );
        }
        return 'Você ainda não respondeu a nenhuma questão baseada em artigos específicos.';
    }

    // PERGUNTA: Artigos nunca utilizados
    if (
        lowerQuery.includes('nunca utilizei') ||
        lowerQuery.includes('nunca testei') ||
        lowerQuery.includes('nunca foram usados')
    ) {
        const allArticleIds = Array.from(articleMap.keys());
        const usedArticleIds = new Set(articlesWithStats.map((a) => a.id));
        const unusedArticles = allArticleIds.filter(
            (id) => !usedArticleIds.has(id)
        );

        if (unusedArticles.length > 0) {
            let response = `Você tem **${unusedArticles.length}** artigos que ainda não foram testados em quizzes. É uma ótima oportunidade para explorar novos conteúdos!\n\nAlguns exemplos são:\n`;
            unusedArticles.slice(0, 5).forEach((id) => {
                const article = articleMap.get(id);
                if (article) {
                    response += `* **${article.fullReference}** (${article.subject})\n`;
                }
            });
            return response;
        }
        return 'Impressionante! Parece que você já abordou todos os artigos disponíveis em seus quizzes.';
    }

    // PERGUNTA: Flashcards mais vistos
    if (
        lowerQuery.includes('flashcard mais visto') ||
        lowerQuery.includes('flashcards mais vistos') ||
        lowerQuery.includes('flashcards que mais revisei')
    ) {
        const sortedByViews = [...lexiaFlashcards].sort(
            (a, b) => (b.viewCount || 0) - (a.viewCount || 0)
        );
        const topViewed = sortedByViews.slice(0, 5);

        if (topViewed.length > 0 && topViewed[0].viewCount > 0) {
            let response = 'Os flashcards que você mais revisou são:\n\n';
            topViewed.forEach((card) => {
                if ((card.viewCount || 0) > 0) {
                    const title =
                        card.articleReference ||
                        card.question.substring(0, 50) + '...';
                    response += `* **${title}** - ${card.viewCount} revisões\n`;
                }
            });
            return response;
        }
        return 'Você ainda não revisou nenhum flashcard.';
    }

    // PERGUNTA: Flashcards nunca vistos
    if (
        lowerQuery.includes('flashcards que não vi') ||
        lowerQuery.includes('flashcards nunca vistos')
    ) {
        const unseenFlashcards = lexiaFlashcards.filter(
            (card) => (card.viewCount || 0) === 0 && !card.isArchived
        );

        if (unseenFlashcards.length > 0) {
            let response = `Encontrei **${unseenFlashcards.length}** flashcards que você ainda não revisou. Que tal começar por eles?\n\nAlguns deles são:\n`;
            unseenFlashcards.slice(0, 5).forEach((card) => {
                const title =
                    card.articleReference ||
                    card.question.substring(0, 50) + '...';
                response += `* **${title}**\n`;
            });
            return response;
        }
        return 'Parabéns! Você já revisou todos os seus flashcards ao menos uma vez.';
    }

    // Fallback: se nenhuma intenção específica foi encontrada
    return "Não consegui entender sua pergunta sobre estatísticas. Tente perguntar sobre seu 'desempenho geral', 'artigos que mais errei', 'flashcards mais vistos' ou 'artigos nunca utilizados'.";
}

// Adicione esta função em app.js

// SUBSTITUA A FUNÇÃO isStatisticalQuery EXISTENTE POR ESTA:

function isStatisticalQuery(query) {
    const lowerQuery = query.toLowerCase();
    const keywords = [
        'meu progresso',
        'minhas estatísticas',
        'meu desempenho',
        'desempenho geral',
        'mais errei',
        'mais erro',
        'piores artigos',
        'mais acertei',
        'mais acerto',
        'melhores artigos',
        'mais utilizados',
        'mais cobrados',
        'mais testados',
        'nunca utilizei',
        'nunca testei',
        'nunca foram usados',
        'flashcard mais visto',
        'flashcards mais vistos', // <-- CORREÇÃO: Adicionada a forma singular
        'flashcard que mais revisei',
        'flashcards que mais revisei',
        'flashcards que não vi',
        'flashcards nunca vistos',
        'quantas vezes',
    ];
    // Retorna true se qualquer uma das palavras-chave for encontrada na pergunta
    return keywords.some((keyword) => lowerQuery.includes(keyword));
}

// Adicione esta nova função em app.js

function renderChatSuggestions() {
    const suggestions = [
        'Qual meu desempenho geral?',
        'Quais artigos eu mais errei?',
        'Quais flashcards eu nunca revisei?',
        'Mostre meus flashcards mais vistos',
    ];

    return `
        <div id="chat-suggestions">
            <p>Ou tente uma destas perguntas:</p>
            <div class="suggestion-buttons">
                ${suggestions
                    .map(
                        (q) =>
                            `<button class="btn btn-secondary suggestion-btn" data-question="${q}">${q}</button>`
                    )
                    .join('')}
            </div>
        </div>
    `;
}

// SUBSTITUA A FUNÇÃO 'setupChatEventListeners' INTEIRA POR ESTA VERSÃO CORRIGIDA:

function setupChatEventListeners() {
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat');
    const chatInterface = document.getElementById('chat-interface'); // Pega o contêiner principal
    const suggestionsContainer = document.getElementById(
        'chat-suggestions-container'
    );
    const showSuggestionsBtn = document.getElementById('show-suggestions-btn');

    // Validação para garantir que todos os elementos existem
    if (
        !chatInput ||
        !sendChatButton ||
        !chatInterface ||
        !suggestionsContainer ||
        !showSuggestionsBtn
    ) {
        console.error(
            'ERRO: Elementos essenciais do chat não encontrados para adicionar listeners.'
        );
        return;
    }

    // --- Listener para Enviar Mensagem (Click) ---
    sendChatButton.addEventListener('click', sendChatMessage);

    // --- Listener para Enviar Mensagem (Enter) ---
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Impede nova linha
            sendChatMessage();
        }
    });

    // --- Listener para Auto-ajuste de Altura do Textarea ---
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto'; // Reseta altura
        chatInput.style.height = `${chatInput.scrollHeight}px`; // Ajusta à altura do conteúdo
    });

    // --- Listener para o Botão de Mostrar/Esconder Sugestões (💡) ---
    showSuggestionsBtn.addEventListener('click', () => {
        // Verifica se a classe está presente no contêiner principal
        const isVisible = chatInterface.classList.contains(
            'suggestions-visible'
        );

        if (isVisible) {
            // Se está visível -> Esconder
            suggestionsContainer.innerHTML = ''; // Limpa o conteúdo das sugestões
            chatInterface.classList.remove('suggestions-visible'); // Remove a classe
            showSuggestionsBtn.setAttribute('aria-expanded', 'false');
            // Opcional: Mudar visual do botão (ex: remover classe 'active')
            showSuggestionsBtn.classList.remove('active');
        } else {
            // Se está escondido -> Mostrar
            suggestionsContainer.innerHTML = renderChatSuggestions(); // Gera e insere o HTML das sugestões
            chatInterface.classList.add('suggestions-visible'); // Adiciona a classe
            showSuggestionsBtn.setAttribute('aria-expanded', 'true');
            // Opcional: Mudar visual do botão (ex: adicionar classe 'active')
            showSuggestionsBtn.classList.add('active');

            // --- DELEGAÇÃO DE EVENTOS para os botões de sugestão recém-criados ---
            // Adiciona um listener no CONTAINER das sugestões que "ouve" cliques nos botões internos
            suggestionsContainer.addEventListener(
                'click',
                function handleSuggestionClick(e) {
                    const suggestionBtn = e.target.closest('.suggestion-btn');
                    if (suggestionBtn) {
                        const question = suggestionBtn.dataset.question;
                        chatInput.value = question; // Preenche o input
                        sendChatMessage(); // Envia a mensagem

                        // Esconde as sugestões após o uso
                        suggestionsContainer.innerHTML = '';
                        chatInterface.classList.remove('suggestions-visible');
                        showSuggestionsBtn.setAttribute(
                            'aria-expanded',
                            'false'
                        );
                        showSuggestionsBtn.classList.remove('active');

                        // Importante: Remove o listener de clique do container para evitar duplicações futuras
                        suggestionsContainer.removeEventListener(
                            'click',
                            handleSuggestionClick
                        );
                    }
                }
            );
            // --- FIM DA DELEGAÇÃO ---
        }
    });

    console.log('[Chat] Event listeners configurados.');
    // Nota: loadChatHistory() geralmente é chamado ao NAVEGAR para a seção de chat, não aqui.
}

// SUBSTITUA A FUNÇÃO 'renderChatInterface' INTEIRA POR ESTA:

// SUBSTITUA A FUNÇÃO 'renderChatInterface' INTEIRA POR ESTA:

function renderChatInterface() {
    const chatSection = document.getElementById('chat');
    chatSection.innerHTML = `
        <h2>Chat IA</h2>
        <div id="chat-interface">
            <div id="chat-messages">
                </div>
            
            <div id="chat-suggestions-container">
                </div>

            <div class="chat-input-container">
                <button id="show-suggestions-btn" class="btn btn-secondary" title="Mostrar Sugestões de Perguntas">
                    💡
                </button>
                <textarea id="chat-input" placeholder="Pergunte algo sobre os PDFs..." rows="1"></textarea>
                <button id="send-chat" class="btn btn-primary" title="Enviar Mensagem">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
            </div>
    `;
    setupChatEventListeners();
    loadChatHistory();
}

// ===================================================== //
// ===== INÍCIO: Funcionalidade de Mapa Mental ===== //
// ===================================================== //

// app.js - SUBSTITUA a função renderMindMapsSection inteira por esta

/**
 * @function renderMindMapsSection
 * @description Renderiza a interface COMPLETA da seção de Mapas Mentais,
 * incluindo geração, filtros, lista de cards e paginação.
 */
function renderMindMapsSection() {
    console.log('[MindMap] Renderizando seção COMPLETA de Mapas Mentais...');
    const mindMapSection = document.getElementById('mindmaps');
    if (!mindMapSection) {
        console.error('[MindMap] ERRO: Seção #mindmaps não encontrada.');
        return;
    }

    // --- Salvar estado dos filtros ---
    const viewFilterValue =
        document.getElementById('mindmaps-view-filter')?.value || 'all';
    const sortFilterValue =
        document.getElementById('mindmaps-sort-filter')?.value || 'recent';
    const trackFilterValue =
        document.getElementById('mindmaps-track-filter')?.value || 'all';
    const difficultyFilterValue =
        document.getElementById('mindmaps-difficulty-filter')?.value || 'all';
    const mapsPerPage = parseInt(
        document.getElementById('mindmaps-per-page-filter')?.value || 12
    );

    // --- Lógica de filtragem ---
    let mapsToDisplay = [...lexiaMindMaps];
    if (viewFilterValue === 'archived') {
        mapsToDisplay = mapsToDisplay.filter((map) => map.isArchived);
    } else {
        mapsToDisplay = mapsToDisplay.filter((map) => !map.isArchived); // Filtra ativos por padrão
        if (viewFilterValue === 'favorites') {
            mapsToDisplay = mapsToDisplay.filter((map) => map.isFavorite);
        }
        // Adicionar filtros de 'viewed'/'not-viewed' se essas propriedades forem implementadas
    }
    if (trackFilterValue !== 'all') {
        mapsToDisplay = mapsToDisplay.filter(
            (map) => (map.sourceTrack || 'Geral') === trackFilterValue
        );
    }
    if (difficultyFilterValue !== 'all') {
        if (difficultyFilterValue === 'unrated') {
            mapsToDisplay = mapsToDisplay.filter((map) => !map.difficultyLevel);
        } else {
            mapsToDisplay = mapsToDisplay.filter(
                (map) => map.difficultyLevel === difficultyFilterValue
            );
        }
    }

    // --- Lógica de Ordenação ---
    mapsToDisplay.sort((a, b) => {
        // Favoritos sempre primeiro (se não estiver arquivado)
        if (!a.isArchived && a.isFavorite && !b.isFavorite) return -1;
        if (!a.isArchived && !a.isFavorite && b.isFavorite) return 1;

        switch (sortFilterValue) {
            case 'recent':
                return new Date(b.created) - new Date(a.created);
            case 'oldest':
                return new Date(a.created) - new Date(b.created);
            // case 'views': return (b.viewCount || 0) - (a.viewCount || 0); // Se viewCount for implementado
            case 'name':
                const nameA = a.customName || a.articleReference || a.id;
                const nameB = b.customName || b.articleReference || b.id;
                return nameA.localeCompare(nameB);
            default:
                return 0;
        }
    });

    // --- Cálculo de Posição (se necessário para múltiplos mapas do mesmo artigo) ---
    // (Pode ser omitido inicialmente se cada mapa é único por artigo)

    // --- Preparação de dados para Filtros ---
    const mindMapsByTrack = {};
    lexiaMindMaps.forEach((map) => {
        const trackName = map.sourceTrack || 'Geral';
        if (!mindMapsByTrack[trackName]) mindMapsByTrack[trackName] = [];
        mindMapsByTrack[trackName].push(map);
    });

    // --- Lógica de Paginação ---
    const totalMaps = mapsToDisplay.length;
    const totalPages = Math.ceil(totalMaps / mapsPerPage) || 1;
    let currentPage = parseInt(mindMapSection.dataset.currentPage || 1);
    if (currentPage > totalPages) currentPage = totalPages;
    mindMapSection.dataset.currentPage = currentPage; // Salva a página atual no elemento da seção
    const startIndex = (currentPage - 1) * mapsPerPage;
    const endIndex = startIndex + mapsPerPage;
    const paginatedMaps = mapsToDisplay.slice(startIndex, endIndex);

    // --- Geração do HTML (SEM COMENTÁRIOS JSX) ---
    mindMapSection.innerHTML = `
        <h2><span class="section-icon">🧠</span> Mapas Mentais</h2>

        <div class="mindmaps-container">

            <div class="generation-section card">
                <h3>⚡ Gerar Novos Mapas Mentais</h3>
                <div class="tracks-selection" id="mindmap-article-selection-area">
                    <p>Carregando artigos...</p> </div>
                <button id="generate-selected-mindmaps" class="btn btn-primary generate-btn" disabled>🚀 Gerar Mapa(s)</button>
            </div>

            <div class="existing-content card">
                <div class="section-header">
                    <h3>📚 Meus Mapas Mentais</h3>
                    <div class="content-stats" id="mindmaps-stats">
                         </div>
                </div>

                <div class="review-actions">
                    <button id="review-all-mindmaps-btn" class="btn btn-secondary" ${
                        totalMaps === 0 ? 'disabled' : ''
                    }>
                        Revisar Todos (${totalMaps})
                    </button>
                    <button id="review-mindmaps-by-difficulty-btn" class="btn btn-secondary" ${
                        totalMaps === 0 ? 'disabled' : ''
                    }>
                        Revisar por Dificuldade...
                    </button>
                </div>

                <button id="toggle-mindmap-filters-btn" class="btn btn-secondary toggle-filters-btn">
                    Filtros <span>▾</span>
                </button>

                <div class="content-filters" id="collapsible-mindmap-filters">
                    <div class="filter-group">
                        <label>Filtrar por:</label>
                        <select id="mindmaps-view-filter" class="filter-select">
                            <option value="all">Ativos</option>
                            <option value="favorites">Favoritos</option>
                            <option value="archived">Arquivados</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Ordenar por:</label>
                        <select id="mindmaps-sort-filter" class="filter-select">
                            <option value="recent">Mais Recentes</option>
                            <option value="oldest">Mais Antigos</option>
                            <option value="name">Nome/Artigo</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Trilha:</label>
                        <select id="mindmaps-track-filter" class="filter-select">
                            <option value="all">Todas as Trilhas</option>
                            ${Object.keys(mindMapsByTrack)
                                .sort()
                                .map(
                                    (track) =>
                                        `<option value="${track}">${
                                            getTrackMetadata(track)
                                                .displayName || track
                                        }</option>`
                                )
                                .join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Dificuldade:</label>
                        <select id="mindmaps-difficulty-filter" class="filter-select">
                             <option value="all">Todas</option>
                             <option value="easy">Fácil</option>
                             <option value="medium">Médio</option>
                             <option value="difficult">Difícil</option>
                             <option value="unrated">Não Classificado</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Itens por pág.:</label>
                        <select id="mindmaps-per-page-filter" class="filter-select">
                            <option value="12">12</option>
                            <option value="24">24</option>
                            <option value="48">48</option>
                        </select>
                    </div>
                </div>

                <div class="content-grid" id="mindmaps-grid">
                    ${renderMindMapCardList(paginatedMaps)} </div>

                <div class="pagination-controls" id="mindmaps-pagination">
                    <button id="prev-mindmap-page-btn" class="btn" ${
                        currentPage === 1 ? 'disabled' : ''
                    }>Anterior</button>
                    <span class="page-info">Página ${currentPage} de ${totalPages} (${totalMaps} mapas)</span>
                    <button id="next-mindmap-page-btn" class="btn" ${
                        currentPage === totalPages || totalPages === 0
                            ? 'disabled'
                            : ''
                    }>Próxima</button>
                </div>
            </div>
        </div>
    `;

    // --- Atualizar Stats ---
    updateMindMapStats(); // Chama a função para calcular e exibir stats

    // --- Restaurar valores dos filtros ---
    const viewSelect = document.getElementById('mindmaps-view-filter');
    const sortSelect = document.getElementById('mindmaps-sort-filter');
    const trackSelect = document.getElementById('mindmaps-track-filter');
    const difficultySelect = document.getElementById(
        'mindmaps-difficulty-filter'
    );
    const perPageSelect = document.getElementById('mindmaps-per-page-filter');

    if (viewSelect) viewSelect.value = viewFilterValue;
    if (sortSelect) sortSelect.value = sortFilterValue;
    if (trackSelect) trackSelect.value = trackFilterValue;
    if (difficultySelect) difficultySelect.value = difficultyFilterValue;
    if (perPageSelect) perPageSelect.value = mapsPerPage;

    // --- Renderizar Seleção de Artigos e Anexar Listeners ---
    renderMindMapArticleSelection(); // Renderiza a lista de artigos na área de geração
    setupMindMapEventListeners(); // Anexa TODOS os listeners da seção de mapas mentais
}

// app.js - SUBSTITUA a função renderMindMapCardList inteira por esta

/**
 * @function renderMindMapCardList
 * @description Gera o HTML para a lista de cards de mapas mentais.
 * @param {Array} mindMaps - Array de objetos de mapa mental a serem exibidos.
 * @returns {string} O HTML da lista de cards.
 */
function renderMindMapCardList(mindMaps) {
    console.log(
        `[MindMap] Renderizando ${mindMaps?.length || 0} cards de mapa mental.`
    );

    if (!mindMaps || mindMaps.length === 0) {
        return '<p class="no-items">Nenhum mapa mental encontrado para os filtros selecionados.</p>';
    }

    // Função auxiliar para label de dificuldade
    const getDifficultyLabel = (level) => {
        switch (level) {
            case 'easy':
                return 'Fácil';
            case 'medium':
                return 'Médio';
            case 'difficult':
                return 'Difícil';
            default:
                return null;
        }
    };

    return mindMaps
        .map((map) => {
            if (!map || typeof map !== 'object') {
                console.warn(
                    '[MindMap] Item de mapa mental inválido encontrado:',
                    map
                );
                return ''; // Ignora item inválido
            }

            const safeMap = {
                id: map.id || `missing-id-${Date.now()}-${Math.random()}`,
                customName: map.customName || '',
                articleReference: map.articleReference || 'Artigo Desconhecido',
                sourceTrack: map.sourceTrack || 'Geral',
                isFavorite: map.isFavorite || false,
                isArchived: map.isArchived || false,
                created: map.created || new Date().toISOString(),
                difficultyLevel: map.difficultyLevel || null,
            };

            let displayName = safeMap.customName || safeMap.articleReference;
            // Adicionar lógica de expoente se múltiplos mapas por artigo forem implementados

            const difficultyLevel = safeMap.difficultyLevel;
            const difficultyLabel = getDifficultyLabel(difficultyLevel);
            const difficultyClass = difficultyLevel
                ? `difficulty-${difficultyLevel}`
                : 'difficulty-unrated';

            // HTML SEM COMENTÁRIOS JSX
            return `
        <div class="mindmap-card ${safeMap.isFavorite ? 'favorite' : ''} ${
                safeMap.isArchived ? 'archived' : ''
            }" data-mindmap-id="${safeMap.id}">

            <div class="mindmap-header">
                <div class="mindmap-title-area">
                    <h4 class="mindmap-title" title="Mapa mental para ${
                        safeMap.articleReference
                    }">${displayName}</h4>
                    ${
                        difficultyLabel
                            ? `<span class="difficulty-badge ${difficultyClass}">${difficultyLabel}</span>`
                            : ''
                    }
                </div>
                <div class="flashcard-actions"> <button class="flashcard-action-btn favorite-btn" title="${
                    safeMap.isFavorite ? 'Desfavoritar' : 'Favoritar'
                }">${safeMap.isFavorite ? '⭐' : '☆'}</button>
                    <button class="flashcard-action-btn edit-btn" title="Renomear">✏️</button>
                    <button class="flashcard-action-btn archive-btn" title="${
                        safeMap.isArchived ? 'Desarquivar' : 'Arquivar'
                    }">${safeMap.isArchived ? '📂' : '📁'}</button>
                    <button class="flashcard-action-btn delete-btn" title="Excluir">🗑️</button>
                </div>
            </div>

            <div class="mindmap-footer">
                <div class="mindmap-meta">
                    <span class="meta-item source" title="Trilha de Origem">📚 ${
                        getTrackMetadata(safeMap.sourceTrack).displayName ||
                        safeMap.sourceTrack
                    }</span>
                    <span class="meta-item created" title="Criado em">${new Date(
                        safeMap.created
                    ).toLocaleDateString('pt-BR')}</span>
                </div>
                <button class="btn btn-primary view-mindmap-btn">Visualizar Mapa</button>
            </div>

        </div>
        `;
        })
        .join('');
}

// app.js - SUBSTITUA a função renderMindMapArticleSelection inteira por esta

/**
 * @function renderMindMapArticleSelection
 * @description Renderiza a lista de artigos (com preview e botão Ler) para seleção
 * na seção de GERAÇÃO de Mapas Mentais.
 */
function renderMindMapArticleSelection() {
    const selectionArea = document.getElementById(
        'mindmap-article-selection-area'
    );
    if (!selectionArea) {
        console.error(
            '[MindMap] ERRO: Área #mindmap-article-selection-area não encontrada para renderizar artigos.'
        );
        return;
    }

    // --- Reutiliza lógica de busca e agrupamento ---
    const uniqueFiles = [...new Set(lexiaChunks.map((chunk) => chunk.file))];
    const tracks = uniqueFiles.map((file) => ({
        fileName: file,
        displayName: getTrackMetadata(file).displayName || file,
    }));

    const tracksWithArticles = tracks
        .map((track) => {
            const fileChunks = lexiaChunks.filter(
                (chunk) => chunk.file === track.fileName
            );
            const articles = fileChunks
                .flatMap((chunk) => chunk.legalArticles || [])
                .filter(
                    (article, index, self) =>
                        article &&
                        article.id &&
                        index ===
                            self.findIndex((a) => a && a.id === article.id)
                );
            articles.sort((a, b) => {
                // Lógica de ordenação mantida
                const numA = parseInt(
                    (a.number || '0').match(/\d+/)?.[0] || '0'
                );
                const numB = parseInt(
                    (b.number || '0').match(/\d+/)?.[0] || '0'
                );
                if (numA !== numB) return numA - numB;
                return (a.fullReference || '').localeCompare(
                    b.fullReference || ''
                );
            });
            return { ...track, articles, articleCount: articles.length };
        })
        .filter((track) => track.articleCount > 0)
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    // --- Geração do HTML (SEM COMENTÁRIOS JSX) ---
    if (tracksWithArticles.length === 0) {
        selectionArea.innerHTML =
            '<p class="no-articles">Nenhum artigo de lei encontrado. Processe PDFs primeiro.</p>';
        const generateBtn = document.getElementById(
            'generate-selected-mindmaps'
        );
        if (generateBtn) generateBtn.disabled = true;
        return;
    }

    selectionArea.innerHTML = `
        <p style="margin-bottom: var(--spacing-4); font-weight: 500; color: var(--text-secondary);">Selecione um ou mais artigos abaixo:</p>
        ${tracksWithArticles
            .map(
                (track, index) => `
            <details class="track-selection-group" ${index === 0 ? 'open' : ''}>
                <summary class="track-header">
                    <h4 class="track-summary-title">${track.displayName}</h4>
                    <span class="article-count">${track.articleCount} ${
                    track.articleCount === 1 ? 'artigo' : 'artigos'
                }</span> </summary>
                <div class="articles-grid"> ${track.articles
                    .map((article) => {
                        const existingMap = lexiaMindMaps.find(
                            (m) => m.articleId === article.id && !m.isArchived
                        );
                        const usageBadgeText = existingMap
                            ? `🧠 Mapa gerado`
                            : `⚪ Não gerado`;
                        const usageBadgeTitle = existingMap
                            ? `Um mapa mental ativo já existe para este artigo.`
                            : `Nenhum mapa mental gerado para este artigo ainda.`;

                        return `
                        <div class="article-card" data-article-id="${
                            article.id
                        }">
                            <label class="article-select">
                                <input type="checkbox" class="article-checkbox"
                                       data-article-id="${article.id}"
                                       data-track="${track.fileName}">
                                <div class="article-info">
                                    <strong class="article-reference">${
                                        article.fullReference ||
                                        `Art. ${article.number}`
                                    }</strong>
                                    <span class="article-usage-badge" title="${usageBadgeTitle}">${usageBadgeText}</span>
                                    <p class="article-subject">${
                                        article.subject ||
                                        'Assunto não definido'
                                    }</p>
                                    <p class="article-text-preview">${
                                        article.fullText
                                            ? article.fullText.substring(
                                                  0,
                                                  120
                                              ) + '...'
                                            : 'Texto não disponível.'
                                    }</p>
                                    <span class="article-law">${
                                        article.law || track.displayName
                                    }</span>
                                </div>
                            </label>
                            <div class="article-card-actions">
                                <button class="btn btn-secondary read-article-btn" data-article-id="${
                                    article.id
                                }" data-track="${
                            track.fileName
                        }">Ler art.</button>
                            </div>
                        </div>
                        `;
                    })
                    .join('')}
                </div>
            </details>
        `
            )
            .join('')}
    `;

    // --- Anexar Listeners ---
    selectionArea.querySelectorAll('.article-checkbox').forEach((checkbox) => {
        checkbox.addEventListener('change', updateGenerateMindMapButtonState);
    });

    // Listener para o botão "Ler art." será tratado por setupMindMapEventListeners

    updateGenerateMindMapButtonState();
    setupMindMapAccordion();
}

/**
 * @function setupMindMapAccordion
 * @description Configura o comportamento do accordion para que apenas
 * um grupo de seleção de trilha fique aberto por vez. Remove listeners antigos.
 */
function setupMindMapAccordion() {
    const selectionArea = document.getElementById(
        'mindmap-article-selection-area'
    );
    if (!selectionArea) return;

    const allDetails = selectionArea.querySelectorAll('.track-selection-group');
    allDetails.forEach((details) => {
        // Remove o listener antigo ANTES de adicionar um novo para evitar duplicação
        details.removeEventListener('toggle', handleAccordionToggle);
        details.addEventListener('toggle', handleAccordionToggle);
    });
    console.log('[MindMap] Listeners do accordion configurados/atualizados.');
}

/**
 * @function handleAccordionToggle
 * @description Função chamada quando um <details> é aberto/fechado.
 * Fecha os outros <details> se um for aberto.
 * @param {Event} event - O evento 'toggle'.
 */
function handleAccordionToggle(event) {
    const currentDetails = event.target;
    // Só age se um <details> foi ABERTO e se ele pertence à seleção de mapas mentais
    if (
        !currentDetails.open ||
        !currentDetails.closest('#mindmap-article-selection-area')
    )
        return;

    const selectionArea = document.getElementById(
        'mindmap-article-selection-area'
    );
    if (!selectionArea) return;

    const allDetails = selectionArea.querySelectorAll('.track-selection-group');
    allDetails.forEach((otherDetails) => {
        // Fecha todos os outros <details> que não sejam o que disparou o evento
        if (otherDetails !== currentDetails) {
            otherDetails.open = false;
        }
    });
}

// app.js - SUBSTITUA a função updateGenerateMindMapButtonState inteira por esta

/**
 * @function updateGenerateMindMapButtonState
 * @description Habilita/desabilita o botão "Gerar Mapa(s)" na seção de GERAÇÃO
 * com base na quantidade de artigos selecionados e atualiza o texto.
 */
function updateGenerateMindMapButtonState() {
    // Seleciona o botão correto pelo ID
    const generateBtn = document.getElementById('generate-selected-mindmaps');
    if (!generateBtn) return;

    // Seleciona apenas os checkboxes DENTRO da área de SELEÇÃO PARA GERAÇÃO
    const selectedCheckboxes = document.querySelectorAll(
        '#mindmap-article-selection-area .article-checkbox:checked'
    );
    const count = selectedCheckboxes.length;

    generateBtn.disabled = count === 0;

    // Atualiza texto e ícone do botão
    generateBtn.innerHTML = `
        🚀 ${count > 0 ? `Gerar Mapa(s) (${count})` : 'Gerar Mapa(s)'}
    `;
}

// app.js - SUBSTITUA a função handleGenerateMindMapClick inteira por esta

/**
 * @function handleGenerateMindMapClick
 * @description Função chamada ao clicar em "Gerar Mapa(s)". Itera sobre os
 * artigos selecionados, gera um mapa mental para CADA UM e os salva.
 */
async function handleGenerateMindMapClick() {
    console.log('[MindMap] Botão Gerar Mapa(s) clicado.');
    const selectedCheckboxes = document.querySelectorAll(
        '#mindmap-article-selection-area .article-checkbox:checked'
    );
    const count = selectedCheckboxes.length;

    if (count === 0) {
        alert(
            'Selecione pelo menos um artigo para gerar o(s) mapa(s) mental(is).'
        );
        return;
    }

    const generateBtn = document.getElementById('generate-selected-mindmaps');
    const originalBtnHTML = generateBtn.innerHTML;
    generateBtn.innerHTML = `🔄 Gerando ${count} mapa(s)...`;
    generateBtn.disabled = true;

    // Desmarcar checkboxes após iniciar para evitar re-geração acidental rápida
    selectedCheckboxes.forEach((cb) => (cb.checked = false));
    updateGenerateMindMapButtonState(); // Atualiza o botão para estado desabilitado (0 selecionados)

    let generatedCount = 0;
    const errors = [];
    const generatedMaps = []; // Guarda os mapas gerados nesta sessão

    // --- Loop para gerar um mapa por artigo ---
    for (let i = 0; i < selectedCheckboxes.length; i++) {
        const checkbox = selectedCheckboxes[i];
        const articleId = checkbox.dataset.articleId;
        const track = checkbox.dataset.track;
        const article = findArticleById(articleId); // Busca o artigo completo

        if (!article || !article.fullText) {
            console.warn(
                `[MindMap Gen] Artigo ${articleId} não encontrado ou sem texto. Pulando.`
            );
            errors.push(
                `Artigo ${
                    article?.fullReference || articleId
                } não encontrado/sem texto.`
            );
            continue;
        }

        console.log(
            `[MindMap Gen] Gerando mapa para: ${article.fullReference} (${
                i + 1
            }/${count})`
        );
        generateBtn.innerHTML = `🔄 Gerando ${article.fullReference}... (${
            i + 1
        }/${count})`; // Atualiza progresso no botão

        try {
            // Monta o prompt para UM artigo
            const prompt = buildMindMapPrompt(
                `--- INÍCIO ARTIGO: ${article.fullReference} ---\n${article.fullText}\n--- FIM ARTIGO ---`,
                article.fullReference,
                1 // Indica que é para um único artigo
            );

            const aiResponseText = await callMindMapGemini(prompt); // Chama a IA

            if (aiResponseText) {
                // Parse da resposta JSON
                let jsonContent = null;
                // (Lógica de extração robusta do JSON - mantida)
                const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
                const match = aiResponseText.match(jsonRegex);
                if (match && match[1]) jsonContent = match[1].trim();
                else {
                    const jsonStartIndex = aiResponseText.indexOf('{');
                    const jsonEndIndex = aiResponseText.lastIndexOf('}');
                    if (
                        jsonStartIndex !== -1 &&
                        jsonEndIndex !== -1 &&
                        jsonEndIndex > jsonStartIndex
                    ) {
                        jsonContent = aiResponseText
                            .substring(jsonStartIndex, jsonEndIndex + 1)
                            .trim();
                    } else {
                        jsonContent = aiResponseText.trim();
                        if (
                            !jsonContent.startsWith('{') ||
                            !jsonContent.endsWith('}')
                        ) {
                            throw new Error('Resposta não parece JSON válido.');
                        }
                    }
                }

                const mindMapData = JSON.parse(jsonContent);

                // Valida a estrutura
                if (
                    mindMapData &&
                    mindMapData.format === 'node_tree' &&
                    mindMapData.data &&
                    mindMapData.data.id === 'root'
                ) {
                    // Cria o objeto do mapa mental para salvar
                    const newMindMap = {
                        id: `mindmap-${Date.now()}-${i}`, // ID único para o mapa
                        articleId: article.id,
                        articleReference: article.fullReference,
                        sourceTrack: article.fileName || track,
                        mapData: mindMapData, // O JSON retornado pela IA
                        difficultyLevel: null, // Inicialmente não classificado
                        isFavorite: false,
                        isArchived: false,
                        customName: '', // Pode ser renomeado depois
                        created: new Date().toISOString(),
                    };
                    lexiaMindMaps.push(newMindMap); // Adiciona ao array global
                    generatedMaps.push(newMindMap); // Adiciona aos gerados nesta sessão
                    generatedCount++;
                    console.log(
                        `[MindMap Gen] Mapa gerado com sucesso para ${article.fullReference}`
                    );
                } else {
                    throw new Error('Estrutura JSON inválida recebida da IA.');
                }
            } else {
                throw new Error('A IA não retornou uma resposta válida.');
            }

            // Pausa entre chamadas para evitar rate limiting (ajuste se necessário)
            if (i < count - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1500)); // 1.5 segundos
            }
        } catch (error) {
            console.error(
                `[MindMap Gen] Erro ao gerar mapa para ${article.fullReference}:`,
                error
            );
            errors.push(`Erro em ${article.fullReference}: ${error.message}`);
        }
    } // Fim do loop for

    // --- Finalização ---
    saveMindMaps(); // Salva todos os mapas gerados (e os antigos)
    generateBtn.innerHTML = originalBtnHTML; // Restaura botão
    // generateBtn.disabled = true; // Mantém desabilitado pois checkboxes foram desmarcados

    // Mostra resultado
    let message = `✅ ${generatedCount} de ${count} mapa(s) mental(is) gerado(s) com sucesso!`;
    if (errors.length > 0) {
        message += `\n\n⚠️ Ocorreram ${errors.length} erro(s):\n- ${errors
            .slice(0, 3)
            .join('\n- ')}`;
        if (errors.length > 3) message += `\n... e mais ${errors.length - 3}.`;
        message += `\n\nVerifique o console para mais detalhes.`;
    }
    alert(message);

    // Re-renderiza a seção para mostrar os novos cards e atualizar tudo
    renderMindMapsSection();
}

// app.js - ADICIONE estas novas funções (ações para os cards de mapa mental)

/**
 * @function toggleMindMapFavorite
 * @description Alterna o estado de favorito de um mapa mental.
 * @param {string} mindMapId - O ID do mapa mental.
 */
function toggleMindMapFavorite(mindMapId) {
    const mapIndex = lexiaMindMaps.findIndex((m) => m.id === mindMapId);
    if (mapIndex !== -1) {
        lexiaMindMaps[mapIndex].isFavorite =
            !lexiaMindMaps[mapIndex].isFavorite;
        saveMindMaps();
        renderMindMapsSection(); // Re-renderiza para atualizar visualmente
        showToast(
            `Mapa mental ${
                lexiaMindMaps[mapIndex].isFavorite
                    ? 'adicionado aos'
                    : 'removido dos'
            } favoritos.`
        );
    } else {
        console.error(
            `[MindMap Action] Mapa com ID ${mindMapId} não encontrado para favoritar.`
        );
    }
}

/**
 * @function toggleMindMapArchive
 * @description Alterna o estado de arquivamento de um mapa mental.
 * @param {string} mindMapId - O ID do mapa mental.
 */
function toggleMindMapArchive(mindMapId) {
    const mapIndex = lexiaMindMaps.findIndex((m) => m.id === mindMapId);
    if (mapIndex !== -1) {
        lexiaMindMaps[mapIndex].isArchived =
            !lexiaMindMaps[mapIndex].isArchived;
        // Se arquivar, remove de favoritos (opcional, mas comum)
        if (lexiaMindMaps[mapIndex].isArchived) {
            lexiaMindMaps[mapIndex].isFavorite = false;
        }
        saveMindMaps();
        renderMindMapsSection(); // Re-renderiza
        showToast(
            `Mapa mental ${
                lexiaMindMaps[mapIndex].isArchived
                    ? 'arquivado'
                    : 'desarquivado'
            }.`
        );
    } else {
        console.error(
            `[MindMap Action] Mapa com ID ${mindMapId} não encontrado para arquivar.`
        );
    }
}

/**
 * @function deleteMindMap
 * @description Exclui permanentemente um mapa mental.
 * @param {string} mindMapId - O ID do mapa mental.
 */
function deleteMindMap(mindMapId) {
    const mapReference =
        lexiaMindMaps.find((m) => m.id === mindMapId)?.articleReference ||
        mindMapId;
    if (
        confirm(
            `Tem certeza que deseja excluir permanentemente o mapa mental para "${mapReference}"? Esta ação não pode ser desfeita.`
        )
    ) {
        const initialLength = lexiaMindMaps.length;
        lexiaMindMaps = lexiaMindMaps.filter((m) => m.id !== mindMapId);
        if (lexiaMindMaps.length < initialLength) {
            saveMindMaps();
            renderMindMapsSection(); // Re-renderiza
            showToast(`Mapa mental excluído com sucesso.`);
        } else {
            console.error(
                `[MindMap Action] Mapa com ID ${mindMapId} não encontrado para excluir.`
            );
        }
    }
}

/**
 * @function renameMindMap
 * @description Permite ao usuário renomear um mapa mental.
 * @param {string} mindMapId - O ID do mapa mental.
 */
function renameMindMap(mindMapId) {
    const mapIndex = lexiaMindMaps.findIndex((m) => m.id === mindMapId);
    if (mapIndex !== -1) {
        const currentMap = lexiaMindMaps[mapIndex];
        const currentName =
            currentMap.customName || currentMap.articleReference;
        const newName = prompt(
            `Digite o novo nome para o mapa mental (atual: "${currentName}"):`,
            currentName
        );

        if (
            newName &&
            newName.trim() !== '' &&
            newName.trim() !== currentName
        ) {
            lexiaMindMaps[mapIndex].customName = newName.trim();
            saveMindMaps();
            renderMindMapsSection(); // Re-renderiza
            showToast(`Mapa mental renomeado para "${newName.trim()}".`);
        } else if (newName === '') {
            // Permite remover o nome customizado
            lexiaMindMaps[mapIndex].customName = '';
            saveMindMaps();
            renderMindMapsSection();
            showToast(`Nome customizado removido.`);
        }
    } else {
        console.error(
            `[MindMap Action] Mapa com ID ${mindMapId} não encontrado para renomear.`
        );
    }
}

/**
 * @function updateMindMapStats
 * @description Calcula e atualiza as estatísticas exibidas na seção de mapas mentais.
 */
function updateMindMapStats() {
    const statsContainer = document.getElementById('mindmaps-stats');
    if (!statsContainer) return;

    const totalVisible = lexiaMindMaps.filter((map) => !map.isArchived).length;
    const favorites = lexiaMindMaps.filter(
        (map) => map.isFavorite && !map.isArchived
    ).length;
    const archived = lexiaMindMaps.filter((map) => map.isArchived).length;

    statsContainer.innerHTML = `
        <span class="stat">Visíveis: ${totalVisible}</span>
        <span class="stat">Favoritos: ${favorites}</span>
        <span class="stat">Arquivados: ${archived}</span>
    `;
}

// app.js - ADICIONE esta nova função

/**
 * @function setupMindMapEventListeners
 * @description Configura todos os event listeners para a seção de Mapas Mentais
 * usando delegação de eventos. Remove listeners antigos clonando a seção.
 */
function setupMindMapEventListeners() {
    console.log('[MindMap] Configurando event listeners...');
    const mindMapSection = document.getElementById('mindmaps');
    if (!mindMapSection) {
        console.error(
            '[MindMap] ERRO: Seção #mindmaps não encontrada para anexar listeners.'
        );
        return;
    }

    // 1. Clonagem para limpar listeners antigos da seção inteira
    const newMindMapSection = mindMapSection.cloneNode(true);
    if (mindMapSection.parentNode) {
        mindMapSection.parentNode.replaceChild(
            newMindMapSection,
            mindMapSection
        );
    } else {
        console.error(
            '[MindMap] ERRO: #mindmaps não tem nó pai para substituição.'
        );
        return; // Aborta se não puder substituir
    }

    // 2. Listener de CLIQUE principal (com delegação)
    newMindMapSection.addEventListener('click', (e) => {
        const target = e.target;
        const targetId = target.id;
        const closestCard = target.closest('.mindmap-card'); // Card de mapa gerado
        const mindMapId = closestCard ? closestCard.dataset.mindmapId : null;
        const closestArticleCard = target.closest('.article-card'); // Card de seleção de artigo
        const articleIdForAction = closestArticleCard
            ? closestArticleCard.dataset.articleId
            : null;

        // --- Ações na Seção de Geração ---
        if (targetId === 'generate-selected-mindmaps') {
            handleGenerateMindMapClick(); // Chama a função de geração (já modificada)
            return;
        }
        const readBtn = target.closest('.read-article-btn');
        if (readBtn && articleIdForAction) {
            const track = readBtn.dataset.track;
            showArticleContentModal(articleIdForAction, track); // Mostra modal do artigo
            return;
        }

        // --- Ações na Seção de Mapas Existentes ---
        if (targetId === 'review-all-mindmaps-btn') {
            // Implementar lógica de revisão de todos os mapas (ex: showMindMapModal sequencial)
            alert('Funcionalidade "Revisar Todos" ainda não implementada.');
            return;
        }
        if (targetId === 'review-mindmaps-by-difficulty-btn') {
            // Implementar modal de seleção de dificuldade para mapas
            alert(
                'Funcionalidade "Revisar por Dificuldade" ainda não implementada.'
            );
            return;
        }
        if (targetId === 'toggle-mindmap-filters-btn') {
            const filtersPanel = newMindMapSection.querySelector(
                '#collapsible-mindmap-filters'
            );
            const buttonSpan = target.querySelector('span');
            if (filtersPanel) {
                const isCurrentlyVisible =
                    window.getComputedStyle(filtersPanel).display !== 'none';
                filtersPanel.style.display = isCurrentlyVisible
                    ? 'none'
                    : 'grid';
                if (buttonSpan)
                    buttonSpan.textContent = isCurrentlyVisible ? '▾' : '▴';
            }
            return;
        }

        // Ações dentro de um Card de Mapa Mental Gerado
        if (mindMapId) {
            if (target.closest('.favorite-btn')) {
                toggleMindMapFavorite(mindMapId);
                return;
            }
            if (target.closest('.edit-btn')) {
                renameMindMap(mindMapId);
                return;
            }
            if (target.closest('.archive-btn')) {
                toggleMindMapArchive(mindMapId);
                return;
            }
            if (target.closest('.delete-btn')) {
                deleteMindMap(mindMapId);
                return;
            }
            if (target.closest('.view-mindmap-btn')) {
                showMindMapModal(mindMapId); // Chama o modal de visualização
                return;
            }
        }

        // Botões de Paginação
        if (targetId === 'prev-mindmap-page-btn') {
            let currentPage = parseInt(
                newMindMapSection.dataset.currentPage || 1
            );
            if (currentPage > 1) {
                newMindMapSection.dataset.currentPage = currentPage - 1;
                renderMindMapsSection();
            }
            return;
        }
        if (targetId === 'next-mindmap-page-btn') {
            let currentPage = parseInt(
                newMindMapSection.dataset.currentPage || 1
            );
            // Pega total de páginas (lógica similar aos flashcards, precisa ajustar se necessário)
            const totalPagesText =
                newMindMapSection.querySelector('.page-info')?.textContent ||
                '';
            const match = totalPagesText.match(/de (\d+)/);
            const totalPages = match ? parseInt(match[1]) : 1;

            if (currentPage < totalPages) {
                newMindMapSection.dataset.currentPage = currentPage + 1;
                renderMindMapsSection();
            }
            return;
        }
    });

    // 3. Listener de MUDANÇA (filtros, checkboxes de GERAÇÃO)
    newMindMapSection.addEventListener('change', (e) => {
        const target = e.target;
        const targetId = target.id;

        // Checkboxes na área de GERAÇÃO
        if (target.classList.contains('article-checkbox')) {
            updateGenerateMindMapButtonState(); // Atualiza o botão Gerar
            return;
        }

        // Filtros da lista principal
        if (
            targetId === 'mindmaps-view-filter' ||
            targetId === 'mindmaps-sort-filter' ||
            targetId === 'mindmaps-track-filter' ||
            targetId === 'mindmaps-difficulty-filter' ||
            targetId === 'mindmaps-per-page-filter'
        ) {
            console.log('[MindMap] Filtro alterado:', targetId, target.value);
            newMindMapSection.dataset.currentPage = 1; // Volta para a primeira página ao filtrar
            renderMindMapsSection(); // Re-renderiza a lista com filtros
            return;
        }
    });

    // 4. Funcionalidade do ACCORDION na GERAÇÃO (mantida)
    setupMindMapAccordion(); // Reconfigura o accordion após clonagem

    console.log('[MindMap] Event listeners configurados.');
}

// app.js - SUBSTITUA a função showMindMapModal inteira por esta

/**
 * @function showMindMapModal
 * @description Cria e exibe um modal para visualizar um mapa mental específico.
 * PASSA O ELEMENTO CONTÊINER DIRETAMENTE para a função de renderização.
 * @param {string} mindMapId - O ID do mapa mental a ser visualizado.
 */
function showMindMapModal(mindMapId) {
    const mindMap = lexiaMindMaps.find((m) => m.id === mindMapId);
    if (!mindMap || !mindMap.mapData) {
        alert('Mapa mental não encontrado ou dados inválidos.');
        console.error(
            `[MindMap Modal] Mapa ${mindMapId} não encontrado ou sem mapData.`
        );
        return;
    }

    // --- Criação do Modal ---
    const modalOverlay = document.createElement('div');
    modalOverlay.id = `mindmap-modal-${mindMapId}`;
    modalOverlay.className = 'modal-overlay mindmap-view-modal';

    const currentDifficulty = mindMap.difficultyLevel || 'unrated';
    const displayName = mindMap.customName || mindMap.articleReference;
    // ===== NOVO: Gerar ID único para o contêiner interno =====
    const modalContainerId = `jsmind_container_modal_${mindMapId}`;
    // =======================================================

    modalOverlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${displayName}</h3>
                <button class="btn-icon close-modal-btn" title="Fechar">✖</button>
            </div>
            <div class="modal-body">
                <div id="${modalContainerId}">
                    <p class="mindmap-hint">Carregando mapa mental...</p>
                </div>
            </div>
            <div class="modal-footer">
                <div class="difficulty-rating-buttons">
                    <p>Classificar este Mapa:</p>
                    <button class="btn btn-difficulty btn-easy ${
                        currentDifficulty === 'easy' ? 'active' : ''
                    }" data-difficulty="easy">Fácil</button>
                    <button class="btn btn-difficulty btn-medium ${
                        currentDifficulty === 'medium' ? 'active' : ''
                    }" data-difficulty="medium">Médio</button>
                    <button class="btn btn-difficulty btn-difficult ${
                        currentDifficulty === 'difficult' ? 'active' : ''
                    }" data-difficulty="difficult">Difícil</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    // --- Renderização do Mapa DENTRO do Modal ---
    // ===== CORREÇÃO: Encontra o elemento DEPOIS de adicionar o modal ao DOM =====
    const mapContainerElement = modalOverlay.querySelector(
        `#${modalContainerId}`
    );
    if (mapContainerElement) {
        // Chama a função passando o ELEMENTO encontrado
        displayMindMapInModal(mindMap.mapData, mapContainerElement);
    } else {
        console.error(
            `[MindMap Modal] ERRO CRÍTICO: Não foi possível encontrar #${modalContainerId} no modal recém-criado.`
        );
        // Tenta fechar o modal ou exibir uma mensagem de erro dentro dele
        if (modalOverlay.parentNode) document.body.removeChild(modalOverlay);
        alert('Erro ao preparar a área de visualização do mapa mental.');
        return; // Aborta se o contêiner não for encontrado
    }
    // =========================================================================

    // --- Listeners do Modal (sem alterações aqui) ---
    modalOverlay
        .querySelector('.close-modal-btn')
        .addEventListener('click', () => {
            if (modalOverlay.parentNode)
                document.body.removeChild(modalOverlay);
            currentMindMapInstance = null; // Limpa a instância do mapa do modal
        });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            if (modalOverlay.parentNode)
                document.body.removeChild(modalOverlay);
            currentMindMapInstance = null;
        }
    });

    modalOverlay
        .querySelectorAll('.difficulty-rating-buttons button')
        .forEach((button) => {
            button.addEventListener('click', (e) => {
                const newDifficulty = e.target.dataset.difficulty;
                const mapIndex = lexiaMindMaps.findIndex(
                    (m) => m.id === mindMapId
                );
                if (mapIndex !== -1) {
                    lexiaMindMaps[mapIndex].difficultyLevel = newDifficulty;
                    saveMindMaps(); // Salva a dificuldade
                    console.log(
                        `[MindMap Modal] Mapa ${mindMapId} classificado como: ${newDifficulty}`
                    );

                    // Atualiza visualmente os botões no modal (opcional, já que vai fechar)
                    // modalOverlay.querySelectorAll('.difficulty-rating-buttons button').forEach(btn => btn.classList.remove('active'));
                    // e.target.classList.add('active');

                    renderMindMapsSection(); // Re-renderiza a lista principal para refletir a mudança no badge
                    showToast(
                        `Mapa classificado como ${getDifficultyLabel(
                            newDifficulty
                        )}.`
                    ); // Mostra notificação

                    // ===== NOVO: Fecha o modal =====
                    if (modalOverlay.parentNode) {
                        document.body.removeChild(modalOverlay);
                    }
                    currentMindMapInstance = null; // Limpa a instância do mapa do modal
                    // ==============================
                }
            });
        });
}

// app.js - SUBSTITUA a função displayMindMapInModal inteira por esta

// app.js - Função displayMindMapInModal COMPLETA (com logs e verificações)

/**
 * @function displayMindMapInModal
 * @description Renderiza um mapa mental usando jsMind DENTRO de um ELEMENTO contêiner específico (modal).
 * @param {object} mindMapData - O objeto JSON do mapa mental (formato node_tree).
 * @param {HTMLElement} containerElement - O ELEMENTO HTML onde o mapa será renderizado.
 */
function displayMindMapInModal(mindMapData, containerElement) {
    // ===== CORREÇÃO: Verifica se o ELEMENTO foi passado corretamente =====
    if (!containerElement || !(containerElement instanceof HTMLElement)) {
        console.error(
            `[MindMap Modal] ERRO: Elemento contêiner inválido fornecido para renderização.`
        );
        // Tenta exibir erro no lugar se possível
        if (containerElement)
            containerElement.innerHTML =
                '<p class="mindmap-hint" style="color: var(--error-color);">Erro: Área de renderização inválida.</p>';
        return;
    }
    const containerId = containerElement.id; // Pega o ID do elemento
    // ====================================================================

    // Verifica jsMind (mantido)
    if (typeof jsMind === 'undefined') {
        console.error(
            '[MindMap Modal] ERRO CRÍTICO: Biblioteca jsMind não carregada.'
        );
        containerElement.innerHTML =
            '<p class="mindmap-hint" style="color: var(--error-color);">Erro: Biblioteca jsMind não carregada.</p>';
        return;
    }

    // Valida dados (mantido)
    if (
        !mindMapData ||
        mindMapData.format !== 'node_tree' ||
        !mindMapData.data ||
        mindMapData.data.id !== 'root'
    ) {
        console.error(
            '[MindMap Modal] ERRO: Dados do mapa inválidos.',
            mindMapData
        );
        containerElement.innerHTML =
            '<p class="mindmap-hint" style="color: var(--error-color);">Erro: Dados do mapa inválidos.</p>';
        return;
    }

    // Opções (COM HMARGIN AUMENTADO)
    const options = {
        container: containerId,
        theme: 'belizehole',
        editable: false,
        mode: 'full',
        support_html: true,
        view: {
            engine: 'svg',
            // ===== HMARGIN AUMENTADO =====
            hmargin: 250, // Mais margem horizontal GERAL (afasta das bordas)
            // =============================
            vmargin: 80, // Margem vertical mantida
            line_width: 2,
            line_color: '#94a3b8',
            draggable: true,
            hide_scrollbars_when_draggable: true,
            node_overflow: 'wrap',
        },
        layout: {
            // Espaçamentos entre nós mantidos altos
            hspace: 120,
            vspace: 60,
            pspace: 25,
        },
        shortcut: { enable: true, mappings: {} },
    };

    // ===== CORREÇÃO: Usa containerElement diretamente =====
    containerElement.innerHTML = ''; // Limpa "Carregando..."
    containerElement.style.display = 'block'; // Garante visibilidade
    // Altura/Largura devem ser controladas pelo CSS do '.modal-body > div'
    // ====================================================

    try {
        console.log(
            `[MindMap Modal] Inicializando jsMind em #${containerId}...`
        );
        currentMindMapInstance = new jsMind(options); // A instância ainda usa o ID

        // Habilita zoom por scroll NO PAINEL DO MODAL (mantido)
        if (
            currentMindMapInstance.view &&
            currentMindMapInstance.view.e_panel
        ) {
            const panel = currentMindMapInstance.view.e_panel;
            panel.removeEventListener('wheel', handleMindMapZoom);
            panel.addEventListener('wheel', handleMindMapZoom, {
                passive: false,
            });
            console.log('[MindMap Modal] Zoom com scroll habilitado.');
        } else {
            console.warn(
                '[MindMap Modal] e_panel não encontrado para listener de zoom.'
            );
        }

        // ===== ADICIONAR VERIFICAÇÃO APÓS O SHOW =====
        currentMindMapInstance.show(mindMapData);
        // A função show não retorna um valor útil padrão, mas verificamos se algum erro ocorreu
        // A principal verificação é se o canvas foi criado (feito no setTimeout abaixo)
        console.log(
            '[MindMap Modal] Mapa exibido com sucesso (chamada a show() completada).'
        );
        // ===========================================

        // Verifica renderização (mantido)
        setTimeout(() => {
            // ===== CORREÇÃO: Busca dentro do containerElement =====
            const engineElement = containerElement.querySelector('canvas, svg');
            // ====================================================
            if (engineElement) {
                console.log(
                    `[MindMap Modal] Elemento <${engineElement.tagName.toLowerCase()}> encontrado.`
                );
                // ===== NOVO: Verificar dimensões do canvas =====
                console.log(
                    `[MindMap Modal] Dimensões computadas do Canvas: ${engineElement.offsetWidth}w x ${engineElement.offsetHeight}h`
                );
                if (
                    engineElement.offsetWidth === 0 ||
                    engineElement.offsetHeight === 0
                ) {
                    console.warn(
                        '[MindMap Modal] Atenção: O elemento Canvas foi criado, mas tem dimensões zero. Verifique o CSS.'
                    );
                }
                // =============================================
            } else {
                console.warn(
                    '[MindMap Modal] Elemento <canvas> ou <svg> NÃO encontrado após show(). Renderização falhou?'
                );
            }
        }, 300); // Delay ligeiramente maior para garantir renderização
    } catch (e) {
        console.error(
            '[MindMap Modal] ERRO CRÍTICO ao inicializar/exibir jsMind:',
            e
        );
        if (e.stack) console.error('Stack Trace:', e.stack);
        // ===== CORREÇÃO: Usa containerElement para erro =====
        containerElement.innerHTML =
            '<p class="mindmap-hint" style="color: var(--error-color);">Erro ao renderizar mapa.</p>';
        // ====================================================
        currentMindMapInstance = null; // Limpa instância em caso de erro
    }
}
/**
 * @function buildMindMapPrompt
 * @description Constrói o prompt detalhado para a API Gemini gerar o mapa mental em JSON.
 * Adaptado de mindmap_script.js para integração com Lexia.
 * @param {string} articlesText - O texto concatenado dos artigos selecionados.
 * @param {string} firstArticleRef - A referência do primeiro artigo (para título).
 * @param {number} articleCount - O número de artigos selecionados.
 * @returns {string} O prompt completo para a IA.
 */
function buildMindMapPrompt(articlesText, firstArticleRef, articleCount) {
    // Define o título do mapa (meta name)
    const metaName =
        articleCount === 1
            ? `Mapa Mental - ${firstArticleRef}`
            : `Mapa Mental - ${articleCount} Artigos Selecionados`;

    // Define instruções específicas para Nível 2 dependendo se é 1 ou múltiplos artigos
    const specificInstructionsLevel2 =
        articleCount === 1
            ? `2.  **Ramificações (Nível 2):** Use os **Parágrafos (§)** e o **Caput** como as ramificações principais. Agrupe incisos (I, II, III...) e alíneas (a, b, c...) do caput ou parágrafos de forma lógica dentro de sub-tópicos (ex: "Caput - Elementos Essenciais", "§ 1º - Exceções"). Utilize 'direction: right' para o Caput e Parágrafos ímpares, e 'direction: left' para Parágrafos pares, para melhor distribuição visual.`
            : `2.  **Ramificações (Nível 2):** Crie uma ramificação principal (com emoji ⚖️) para CADA ARTIGO FORNECIDO. Use a referência completa e um breve título como tópico (ex: "⚖️ Art. 121 - Homicídio Simples"). Defina 'expanded: true' para estas ramificações de artigo. Alterne 'direction' (right/left) para cada artigo principal para distribuição equilibrada.`;

    // Define instruções específicas para Nível 3+
    const specificInstructionsLevel3Plus =
        articleCount === 1
            ? `3.  **Sub-ramificações (Nível 3+):** Detalhe os conceitos de CADA ramificação (parágrafo/caput). É OBRIGATÓRIO incluir os seguintes elementos quando presentes no texto correspondente:`
            : `3.  **Sub-ramificações (Nível 3 - Dentro de cada Artigo):** Use os **Parágrafos (§)** e o **Caput** como sub-ramificações (com emojis 🏛️ e 📦). Agrupe incisos e alíneas de forma lógica dentro de sub-tópicos. Defina 'expanded: false' para estas sub-ramificações.
4.  **Detalhes (Nível 4+):** Dentro de cada Caput ou Parágrafo, detalhe os conceitos. É OBRIGATÓRIO incluir os seguintes elementos quando presentes no texto correspondente:`;

    // Define a numeração correta para as instruções restantes
    const emojiInstructionNumber = articleCount === 1 ? '4.' : '5.';
    const concisenessInstructionNumber = articleCount === 1 ? '5.' : '6.';

    // Define a estrutura de exemplo para 'children' no JSON
    // EXEMPLO PARA UM ARTIGO
    const nodeStructureExampleSingle = `"children": [
      { "id": "caput", "topic": "🏛️ Caput: [Síntese do Caput]", "direction": "right", "expanded": false,
         "children": [
             { "id": "caput_acao", "topic": "▶️ Ação: [Verbo(s)]" },
             { "id": "caput_pena", "topic": "⚖️ Pena: [Descrição da Pena]" },
             { "id": "caput_detalhes", "topic": "📄 Detalhes: [Pontos chave, incisos agrupados]" }
             /* Adicionar mais detalhes como Condição, Prazo, etc., se houver */
         ]
      },
      { "id": "para1", "topic": "📦 § 1º: [Síntese do Parágrafo]", "direction": "left", "expanded": false,
         "children": [
              { "id": "para1_condicao", "topic": "⚠️ Condição: [Descrição]" },
              { "id": "para1_pena", "topic": "⚖️ Pena: [Se diferente, senão omitir]" }
              /* Adicionar mais detalhes se houver */
         ]
      },
      { "id": "para2", "topic": "📦 § 2º: [Síntese do Parágrafo]", "direction": "right", "expanded": false, /* Alterna direção */
         "children": [ /* Detalhes do parágrafo 2 */ ]
      }
      // ... mais parágrafos se existirem, alternando a direção ...
    ]`;

    // EXEMPLO PARA MÚLTIPLOS ARTIGOS
    const nodeStructureExampleMultiple = `"children": [
      { "id": "art1", "topic": "⚖️ Art. XXX - [Título do Artigo 1]", "direction": "right", "expanded": true,
         "children": [
              { "id": "art1_caput", "topic": "🏛️ Caput: [Síntese]", "expanded": false,
                 "children": [
                     { "id": "art1_caput_acao", "topic": "▶️ Ação: ..." },
                     { "id": "art1_caput_pena", "topic": "⚖️ Pena: ..." }
                     /* Mais detalhes do caput */
                 ]
              },
              { "id": "art1_para1", "topic": "📦 § 1º: [Síntese]", "expanded": false,
                 "children": [
                      { "id": "art1_para1_detalhe", "topic": "📄 Detalhes: ..." }
                      /* Mais detalhes do parágrafo */
                 ]
              }
              /* Mais parágrafos do Artigo 1 */
         ]
      },
      { "id": "art2", "topic": "⚖️ Art. YYY - [Título do Artigo 2]", "direction": "left", "expanded": true, /* Direção alternada */
         "children": [
              { "id": "art2_caput", "topic": "🏛️ Caput: [Síntese]", "expanded": false, "children": [/* ... */] },
              { "id": "art2_para1", "topic": "📦 § 1º: [Síntese]", "expanded": false, "children": [/* ... */] }
              /* Mais parágrafos do Artigo 2 */
         ]
      }
      // ... mais artigos se existirem, alternando a direção ...
    ]`;

    // Escolhe o exemplo correto
    const nodeStructureExample =
        articleCount === 1
            ? nodeStructureExampleSingle
            : nodeStructureExampleMultiple;

    // Monta o prompt final
    return `
Você é um assistente jurídico de elite, especializado em criar mapas mentais para auxiliar na preparação para concursos públicos (nível Escrevente TJSP). Sua análise deve ser estritamente baseada no texto legal fornecido.
Seu objetivo é extrair a estrutura hierárquica e os **detalhes cruciais** do(s) artigo(s), com foco principal em **prazos, penas, verbos de ação, sujeitos, objetos, condições, classificações e exceções**.

**TEXTO DO(S) ARTIGO(S) FORNECIDO(S):**
"""
${articlesText}
"""

**INSTRUÇÕES DETALHADAS PARA A ESTRUTURA DO MAPA MENTAL:**
1.  **Ideia Central (Nó Raiz - 'root'):** ${
        articleCount === 1
            ? `Deve ser concisa, contendo a referência do artigo e seu assunto principal (ex: "${firstArticleRef} - Homicídio Simples")`
            : `"Síntese dos ${articleCount} Artigos Selecionados"`
    }.
${specificInstructionsLevel2}
${specificInstructionsLevel3Plus}
    * **Ação(ões):** Use o emoji ▶️ seguido de "Ação:" e os verbos principais (ex: "▶️ Ação: Matar, Subtrair, Omitir").
    * **Pena:** Use o emoji ⚖️ seguido de "Pena:" e a descrição completa (ex: "⚖️ Pena: Reclusão, 6 a 20 anos"). **É OBRIGATÓRIO destacar penas diferentes** em parágrafos específicos.
    * **Detalhes Chave:** Use o emoji 📄 seguido de "Detalhes:" para agrupar elementos importantes como objetos do crime, sujeitos, qualificadoras, majorantes, incisos, alíneas etc. (ex: "📄 Detalhes: Motivo fútil, meio cruel (Incisos I, II)").
    * **Condições/Prazos:** Use o emoji ⚠️ para condições (ex: "⚠️ Condição: Se o crime é culposo") e ⏳ para prazos (ex: "⏳ Prazo: Decadência em 6 meses").
    * **Classificação:** Use o emoji 🏷️ seguido de "Tipo:" ou "Classificação:" (ex: "🏷️ Tipo: Crime material").
    * **Exceções/Regras Específicas:** Use o emoji 🚫 seguido de "Exceção:" (ex: "🚫 Exceção: Não se aplica se...").
${emojiInstructionNumber} **Emojis:** Adicione um emoji relevante no início de CADA tópico (exceto o nó raiz) para melhorar a retenção visual. Use emojis variados e apropriados ao conteúdo jurídico (🏛️, 📦, ▶️, ⚖️, 📄, ⚠️, ⏳, 🏷️, 🚫, 🎯, 💡, etc.).
${concisenessInstructionNumber} **Concisão e Clareza:** Mantenha os tópicos curtos, mas informativos. Evite copiar frases longas; sintetize a informação essencial. O mapa deve servir como ferramenta de revisão rápida e eficiente.

**FORMATO DE SAÍDA OBRIGATÓRIO (JSON VÁLIDO):**
Responda **APENAS** com o objeto JSON, sem nenhum texto introdutório, final ou marcadores como \`\`\`json. Certifique-se de que o JSON esteja sintaticamente correto (vírgulas, chaves, colchetes).

{
  "meta": {
    "name": "${metaName}",
    "author": "Lexia IA",
    "version": "1.2" /* Versão atualizada do prompt */
  },
  "format": "node_tree",
  "data": {
    "id": "root",
    "topic": "<Tópico da Ideia Central Conforme Instrução 1>",
    ${nodeStructureExample}
  }
}

**REFORÇO IMPORTANTE:**
* Retorne **SOMENTE** o JSON válido.
* Detalhe **TODAS** as penas e prazos mencionados.
* Se múltiplos artigos forem fornecidos, crie um ramo principal para cada um, alternando a direção ('right'/'left').
* Para um único artigo, alterne a direção ('right'/'left') entre Caput/Parágrafos.
* Mantenha a estrutura hierárquica (Artigo -> Caput/Parágrafo -> Detalhes).
* Use os emojis conforme especificado.
`;
}

/**
 * @function callMindMapGemini
 * @description Encapsula a chamada à API Gemini especificamente para mapas mentais.
 * Reutiliza a função 'callGemini' principal do app.js.
 * @param {string} prompt - O prompt a ser enviado para a IA.
 * @returns {Promise<string|null>} A resposta textual da IA ou null em caso de erro.
 */
async function callMindMapGemini(prompt) {
    console.log('[MindMap] Chamando API Gemini para Mapa Mental...');
    // Reutiliza a função 'callGemini' existente, passando o modelo desejado
    // Usar 'gemini-2.0-flash' ou outro modelo disponível e adequado
    try {
        // Certifique-se de que a função callGemini lida com erros e retries
        const response = await callGemini(prompt, 'gemini-2.0-flash'); // Usando modelo flash
        if (!response) {
            console.error(
                '[MindMap] callMindMapGemini: A chamada para callGemini retornou null ou vazio.'
            );
            // Poderia adicionar um alerta aqui se desejado
        }
        return response;
    } catch (error) {
        console.error(
            '[MindMap] Erro dentro de callMindMapGemini ao chamar callGemini:',
            error
        );
        return null; // Retorna null explicitamente em caso de erro na chamada
    }
}

/**
 * @function displayMindMap
 * @description Renderiza o mapa mental na interface usando a biblioteca jsMind.
 * Adaptado de mindmap_script.js para integração com Lexia.
 * @param {object} mindData - O objeto JSON contendo os dados do mapa mental no formato node_tree.
 */
function displayMindMap(mindData) {
    const mapContainerId = 'jsmind_container_lexia'; // ID do contêiner no HTML do Lexia
    const mapContainer = document.getElementById(mapContainerId);

    // Verifica se a biblioteca jsMind está carregada globalmente
    if (typeof jsMind === 'undefined') {
        console.error(
            '[MindMap] ERRO CRÍTICO: A biblioteca jsMind não foi carregada no HTML (verifique a tag <script>).'
        );
        if (mapContainer)
            mapContainer.innerHTML =
                '<p class="mindmap-hint" style="color: var(--error-color); text-align: center;">Erro Interno: A biblioteca de mapa mental (jsMind) não está carregada.</p>';
        alert(
            'Erro: A biblioteca jsMind não foi carregada. Verifique o console.'
        );
        return;
    }

    // Valida os dados recebidos antes de tentar renderizar
    if (
        !mindData ||
        typeof mindData !== 'object' ||
        mindData.format !== 'node_tree' ||
        !mindData.data ||
        typeof mindData.data !== 'object' ||
        mindData.data.id !== 'root'
    ) {
        console.error(
            '[MindMap] ERRO: Dados do mapa mental inválidos ou formato incorreto recebido da IA.',
            mindData
        );
        if (mapContainer)
            mapContainer.innerHTML =
                '<p class="mindmap-hint" style="color: var(--error-color); text-align: center;">Erro: A estrutura de dados recebida da IA para o mapa mental é inválida.</p>';
        alert('Erro: Estrutura de dados do mapa inválida recebida da IA.');
        return;
    }

    // Opções de configuração para o jsMind (ajustadas para Lexia)
    const options = {
        container: mapContainerId, // ID do elemento HTML onde o mapa será desenhado
        theme: 'belizehole', // Tema visual (pode ser alterado, CSS adaptado para este)
        editable: false, // Desabilita edição direta no mapa pelo usuário
        mode: 'full', // Layout 'full' (ramifica para ambos os lados)
        support_html: true, // Permite HTML nos tópicos (importante para emojis)
        view: {
            engine: 'canvas', // Motor de renderização ('canvas' é geralmente mais performático)
            hmargin: 80, // Margem horizontal mínima entre nós e borda
            vmargin: 40, // Margem vertical mínima
            line_width: 2, // Espessura das linhas de conexão
            line_color: 'var(--primary-color)', // Cor das linhas usando variável CSS do Lexia
            draggable: true, // Permite arrastar o mapa com o mouse
            hide_scrollbars_when_draggable: true, // Esconde barras de rolagem ao arrastar
            node_overflow: 'wrap', // FORÇA quebra de linha dentro dos nós (IMPORTANTE)
        },
        layout: {
            hspace: 70, // Espaçamento horizontal entre nós irmãos (ajuste conforme necessário)
            vspace: 35, // Espaçamento vertical entre nós irmãos (ajuste conforme necessário)
            pspace: 15, // Espaçamento entre nó pai e linha de conexão
        },
        shortcut: {
            enable: true, // Habilita atalhos de teclado (ex: zoom com +/- não funciona por padrão, mas drag sim)
            mappings: {}, // Mapeamentos padrão são geralmente suficientes
        },
    };

    // Limpa o contêiner e garante que esteja visível e com altura correta
    if (!mapContainer) {
        console.error(
            `[MindMap] ERRO CRÍTICO: Contêiner do mapa #${mapContainerId} não encontrado no DOM.`
        );
        return;
    }
    mapContainer.innerHTML = ''; // Limpa mensagens de erro ou mapas anteriores
    mapContainer.style.display = 'block';
    mapContainer.style.height = '600px'; // Garante a altura padrão

    try {
        console.log('[MindMap] Inicializando jsMind com as opções...');
        // Cria a instância do jsMind e a armazena na variável global
        currentMindMapInstance = new jsMind(options);
        console.log(
            '[MindMap] Instância jsMind criada:',
            currentMindMapInstance
        );

        // Habilita o zoom usando o scroll do mouse (sem Ctrl)
        if (
            currentMindMapInstance.view &&
            currentMindMapInstance.view.e_panel
        ) {
            const panel = currentMindMapInstance.view.e_panel;
            // Remove listener antigo para evitar duplicação se a função for chamada novamente
            panel.removeEventListener('wheel', handleMindMapZoom);
            panel.addEventListener('wheel', handleMindMapZoom, {
                passive: false,
            }); // passive:false é crucial para preventDefault funcionar
            console.log(
                '[MindMap] Zoom com scroll do mouse habilitado no painel do mapa.'
            );
        } else {
            console.warn(
                '[MindMap] Não foi possível encontrar o painel (e_panel) do jsMind para adicionar o listener de zoom com scroll.'
            );
        }

        // Exibe o mapa mental com os dados fornecidos pela IA
        currentMindMapInstance.show(mindData);
        console.log(
            '[MindMap] Mapa mental exibido com sucesso via jsMind.show().'
        );

        // Opcional: Habilitar botão 'Salvar' se existir um
        // const saveBtn = document.getElementById('save-mindmap-btn');
        // if (saveBtn) saveBtn.disabled = false;

        // Log de verificação pós-renderização (útil para depurar falhas silenciosas)
        setTimeout(() => {
            if (mapContainer) {
                // Verifica se o elemento canvas (ou svg, dependendo do engine) foi criado dentro do container
                const engineElement = mapContainer.querySelector('canvas, svg');
                if (engineElement)
                    console.log(
                        `[MindMap] Elemento <${engineElement.tagName.toLowerCase()}> do mapa encontrado. Renderização OK.`
                    );
                else
                    console.warn(
                        '[MindMap] Elemento <canvas> ou <svg> NÃO encontrado. Renderização do jsMind pode ter falhado silenciosamente.'
                    );
            }
        }, 300); // Pequeno delay para dar tempo de renderizar
    } catch (e) {
        // Captura erros durante a inicialização ou exibição do jsMind
        console.error(
            '[MindMap] ERRO CRÍTICO ao inicializar ou exibir o mapa com jsMind:',
            e
        );
        if (e.stack) console.error('[MindMap] Stack Trace:', e.stack); // Log do stack trace ajuda na depuração
        if (mapContainer)
            mapContainer.innerHTML =
                '<p class="mindmap-hint" style="color: var(--error-color); text-align: center;">Ocorreu um erro interno ao tentar renderizar o mapa mental. Consulte o console para detalhes técnicos.</p>';
        currentMindMapInstance = null; // Reseta a instância em caso de erro grave
        alert(
            'Ocorreu um erro ao renderizar o mapa mental. Verifique o console.'
        );
    }
}

/**
 * @function handleMindMapZoom
 * @description Função para lidar com o evento de 'wheel' (scroll) no painel do mapa mental,
 * aplicando zoom in/out. É chamada pelo listener adicionado em displayMindMap.
 * @param {WheelEvent} event - O evento de wheel.
 */
function handleMindMapZoom(event) {
    // Verifica se existe uma instância ativa do mapa
    if (!currentMindMapInstance || !currentMindMapInstance.view) {
        console.warn(
            '[MindMap] Tentativa de zoom sem instância do mapa ativa.'
        );
        return;
    }
    event.preventDefault(); // Previne o scroll normal da página DENTRO do contêiner do mapa

    if (event.deltaY < 0) {
        // Scroll para cima (ou para a esquerda em touchpads/macOS) -> Zoom In
        currentMindMapInstance.view.zoomIn();
        // console.log("[MindMap] Zoom In"); // Descomente para depurar zoom
    } else if (event.deltaY > 0) {
        // Scroll para baixo (ou para a direita) -> Zoom Out
        currentMindMapInstance.view.zoomOut();
        // console.log("[MindMap] Zoom Out"); // Descomente para depurar zoom
    }
    // Ignora deltaY === 0 (scroll horizontal em alguns mouses/touchpads)
}

// =================================================== //
// ===== FIM: Funcionalidade de Mapa Mental ===== //
// =================================================== //

// SUBSTITUA A FUNÇÃO 'renderFlashcards' INTEIRA POR ESTA:

// SUBSTITUA A FUNÇÃO 'renderFlashcards' INTEIRA POR ESTA:

function renderFlashcards() {
    const flashcardArea = document.getElementById('flashcard-area');
    if (!flashcardArea) {
        console.error(
            'ERRO: Elemento #flashcard-area não encontrado ao renderizar.'
        );
        return; // Sai se o contêiner principal não existe
    }

    // --- Calcular uso dos artigos ---
    const articleUsageCount = {};
    lexiaFlashcards.forEach((card) => {
        if (card.articleReference) {
            if (!articleUsageCount[card.articleReference]) {
                articleUsageCount[card.articleReference] = 0;
            }
            articleUsageCount[card.articleReference]++;
        }
    });

    // --- Salvar estado dos filtros ---
    const viewFilterValue =
        document.getElementById('flashcards-view-filter')?.value || 'all';
    const sortFilterValue =
        document.getElementById('flashcards-sort-filter')?.value || 'recent';
    const trackFilterValue =
        document.getElementById('flashcards-track-filter')?.value || 'all';
    const difficultyFilterValue =
        document.getElementById('flashcards-difficulty-filter')?.value || 'all';
    const cardsPerPage = parseInt(
        document.getElementById('cards-per-page-filter')?.value || 10
    );

    // --- Lógica de filtragem ---
    let cardsToDisplay = [...lexiaFlashcards];
    if (viewFilterValue === 'archived') {
        cardsToDisplay = cardsToDisplay.filter((card) => card.isArchived);
    } else {
        cardsToDisplay = cardsToDisplay.filter((card) => !card.isArchived);
    }
    if (viewFilterValue !== 'archived') {
        if (viewFilterValue === 'favorites')
            cardsToDisplay = cardsToDisplay.filter((card) => card.isFavorite);
        else if (viewFilterValue === 'viewed')
            cardsToDisplay = cardsToDisplay.filter(
                (card) => (card.viewCount || 0) > 0
            );
        else if (viewFilterValue === 'not-viewed')
            cardsToDisplay = cardsToDisplay.filter(
                (card) => (card.viewCount || 0) === 0
            );
    }
    if (trackFilterValue !== 'all')
        cardsToDisplay = cardsToDisplay.filter(
            (card) => (card.sourceTrack || 'Geral') === trackFilterValue
        );
    if (difficultyFilterValue !== 'all') {
        if (difficultyFilterValue === 'unrated')
            cardsToDisplay = cardsToDisplay.filter(
                (card) => !card.difficultyLevel
            );
        else
            cardsToDisplay = cardsToDisplay.filter(
                (card) => card.difficultyLevel === difficultyFilterValue
            );
    }

    // --- Lógica de Ordenação ---
    cardsToDisplay.sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        switch (sortFilterValue) {
            case 'recent':
                return new Date(b.created) - new Date(a.created);
            case 'oldest':
                return new Date(a.created) - new Date(b.created);
            case 'views':
                return (b.viewCount || 0) - (a.viewCount || 0);
            case 'name':
                const nameA = a.customName || a.articleReference || a.question;
                const nameB = b.customName || b.articleReference || b.question;
                return nameA.localeCompare(nameB);
            default:
                return 0;
        }
    });

    // --- Cálculo de Posição ---
    const flashcardPositionMap = {};
    const referenceCounter = {};
    const sortedByCreation = [...lexiaFlashcards].sort(
        (a, b) => new Date(a.created) - new Date(b.created)
    );
    sortedByCreation.forEach((card) => {
        if (card.articleReference) {
            if (!referenceCounter[card.articleReference])
                referenceCounter[card.articleReference] = 0;
            referenceCounter[card.articleReference]++;
            flashcardPositionMap[card.id] =
                referenceCounter[card.articleReference];
        }
    });

    // --- Preparação de dados para Geração ---
    const uniqueFiles = [...new Set(lexiaChunks.map((chunk) => chunk.file))];
    const tracks = uniqueFiles.map((file) => {
        const metadata = getTrackMetadata(file);
        return { fileName: file, displayName: metadata.displayName };
    });
    const tracksForGeneration = tracks
        .map((track) => {
            const fileChunks = lexiaChunks.filter(
                (chunk) => chunk.file === track.fileName
            );
            const articles = fileChunks.flatMap(
                (chunk) => chunk.legalArticles || []
            );
            return { ...track, articles, articleCount: articles.length };
        })
        .filter((track) => track.articles.length > 0);

    const flashcardsByTrack = {};
    lexiaFlashcards.forEach((card) => {
        const trackName = card.sourceTrack || 'Geral';
        if (!flashcardsByTrack[trackName]) flashcardsByTrack[trackName] = [];
        flashcardsByTrack[trackName].push(card);
    });

    // --- Lógica de Paginação ---
    const totalCards = cardsToDisplay.length;
    const totalPages = Math.ceil(totalCards / cardsPerPage) || 1;
    let currentPage = parseInt(flashcardArea.dataset.currentPage || 1);
    if (currentPage > totalPages) currentPage = totalPages;
    flashcardArea.dataset.currentPage = currentPage;
    const startIndex = (currentPage - 1) * cardsPerPage;
    const endIndex = startIndex + cardsPerPage;
    const paginatedCards = cardsToDisplay.slice(startIndex, endIndex);

    // --- Geração do HTML ---
    flashcardArea.innerHTML = `
        <div class="flashcards-container">
            <div class="generation-section">
                <h3>⚡ Gerar Novos Flashcards</h3>
                <div class="tracks-selection">
                    ${tracksForGeneration
                        .map(
                            (track, index) => `
                        <details class="track-selection-group">
                            <summary class="track-header">
                                <h4 class="track-summary-title">${
                                    track.displayName
                                }</h4>
                                <span class="article-count">${
                                    track.articles.length
                                } artigos</span>
                            </summary>
                            <div class="articles-grid">
                                ${track.articles
                                    .map(
                                        (article) => `
                                    <div class="article-card" data-article-id="${
                                        article.id
                                    }">
                                        <label class="article-select">
                                            <input type="checkbox" class="article-checkbox" 
                                                   data-article-id="${
                                                       article.id
                                                   }" data-track="${
                                            track.fileName
                                        }">
                                            <div class="article-info">
                                                <strong class="article-reference">${
                                                    article.fullReference
                                                }</strong>
                                                <span class="article-usage-badge">${
                                                    articleUsageCount[
                                                        article.fullReference
                                                    ]
                                                        ? `Utilizado ${
                                                              articleUsageCount[
                                                                  article
                                                                      .fullReference
                                                              ]
                                                          } vez(es)`
                                                        : 'Nunca utilizado'
                                                }</span>
                                                <p class="article-subject">${
                                                    article.subject
                                                }</p>
                                                <p class="article-text-preview">${
                                                    article.fullText
                                                        ? article.fullText.substring(
                                                              0,
                                                              120
                                                          ) + '...'
                                                        : 'Texto não disponível.'
                                                }</p>
                                                <span class="article-law">${
                                                    article.law
                                                }</span>
                                            </div>
                                        </label>
                                        <div class="article-card-actions">
                                            <button class="btn btn-secondary read-article-btn" data-article-id="${
                                                article.id
                                            }" data-track="${
                                            track.fileName
                                        }">Ler art.</button>
                                        </div>
                                    </div>
                                `
                                    )
                                    .join('')}
                            </div>
                        </details>
                    `
                        )
                        .join('')}
                </div>
                <div class="generation-options">
                    <h4>🎯 Configurações de Geração</h4>
                    <div class="options-grid">
                        <div class="option-group">
                            <label for="generation-focus">Foco do Flashcard:</label>
                            <select id="generation-focus">
                                <option value="general">Foco Geral</option>
                                <option value="detailed">Foco em Detalhes</option>
                                <option value="conceptual">Foco Conceitual</option>
                                <option value="procedural">Foco Procedimental</option>
                                <option value="specific">Foco Específico</option>
                            </select>
                        </div>
                        <div class="option-group" id="custom-focus-group" style="display: none;">
                            <label for="custom-focus">Digite o foco:</label>
                            <input type="text" id="custom-focus" placeholder="Ex: prazos, penas...">
                        </div>
                        <div class="option-group">
                            <label for="flashcard-style">Estilo:</label>
                            <select id="flashcard-style">
                                <option value="direct">Direto</option>
                                <option value="contextual">Contextual</option>
                                <option value="comparative">Comparativo</option>
                                <option value="application">Aplicação Prática</option>
                            </select>
                        </div>
                    </div>
                </div>
                <button id="generate-selected-flashcards" class="btn-primary generate-btn">🚀 Gerar Flashcards</button>
            </div>

            <div class="existing-flashcards">
                <div class="section-header">
                    <h3>📚 Meus Flashcards</h3>
                    <div class="flashcards-stats">
                         <span class="stat">Visíveis: ${
                             cardsToDisplay.length
                         }</span>
                         <span class="stat">Favoritos: ${
                             lexiaFlashcards.filter(
                                 (f) => f.isFavorite && !f.isArchived
                             ).length
                         }</span>
                         <span class="stat">Arquivados: ${
                             lexiaFlashcards.filter((f) => f.isArchived).length
                         }</span>
                    </div>
                </div> 
                
                <div class="review-actions">
                    <button id="review-all-btn" class="btn btn-secondary" ${
                        lexiaFlashcards.filter((c) => !c.isArchived).length ===
                        0
                            ? 'disabled'
                            : ''
                    }>Revisar Todos (${
        lexiaFlashcards.filter((c) => !c.isArchived).length
    })</button>
                    <button id="review-by-difficulty-btn" class="btn btn-secondary" ${
                        lexiaFlashcards.filter((c) => !c.isArchived).length ===
                        0
                            ? 'disabled'
                            : ''
                    }>Revisar por Dificuldade...</button>
                </div>

                <button id="toggle-filters-btn" class="btn btn-secondary toggle-filters-btn">
                    Filtros <span>▾</span>
                </button>

                <div class="flashcards-filters" id="collapsible-filters"> 
                    <div class="filter-group">
                        <label>Filtrar por:</label>
                        <select id="flashcards-view-filter" class="filter-select">
                            <option value="all">Ativos</option>
                            <option value="favorites">Favoritos</option>
                            <option value="not-viewed">Nunca Vistos</option>
                            <option value="viewed">Visualizados</option>
                            <option value="archived">Arquivados</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Ordenar por:</label>
                        <select id="flashcards-sort-filter" class="filter-select">
                            <option value="recent">Mais Recentes</option>
                            <option value="oldest">Mais Antigos</option>
                            <option value="views">Mais Visualizados</option>
                            <option value="name">Nome</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Trilha:</label>
                        <select id="flashcards-track-filter" class="filter-select">
                            <option value="all">Todas as Trilhas</option>
                            ${Object.keys(flashcardsByTrack)
                                .sort()
                                .map(
                                    (track) =>
                                        `<option value="${track}">${
                                            getTrackMetadata(track)
                                                .displayName || track
                                        }</option>`
                                )
                                .join('')}
                        </select>
                    </div>
                    <div class="filter-group">
                         <label>Dificuldade:</label>
                         <select id="flashcards-difficulty-filter" class="filter-select">
                             <option value="all">Todas</option>
                             <option value="easy">Fácil</option>
                             <option value="medium">Médio</option>
                             <option value="difficult">Difícil</option>
                             <option value="unrated">Não Classificado</option>
                         </select>
                    </div>
                    <div class="filter-group">
                         <label>Itens por pág.:</label>
                         <select id="cards-per-page-filter" class="filter-select">
                             <option value="10">10</option>
                             <option value="20">20</option>
                             <option value="50">50</option>
                             <option value="100">100</option>
                         </select>
                    </div>
                </div>

                <div class="flashcards-grid" id="flashcards-list">
                    ${renderFlashcardsList(
                        paginatedCards,
                        flashcardPositionMap
                    )}
                </div>

                <div class="pagination-controls">
                     <button id="prev-page-btn" class="btn" ${
                         currentPage === 1 ? 'disabled' : ''
                     }>Anterior</button>
                     <span class="page-info">Página ${currentPage} de ${totalPages} (${totalCards} cards)</span>
                     <button id="next-page-btn" class="btn" ${
                         currentPage === totalPages || totalPages === 0
                             ? 'disabled'
                             : ''
                     }>Próxima</button>
                </div>
            </div>
        </div>
    `;

    // --- Restaurar valores dos filtros ---
    const viewSelect = document.getElementById('flashcards-view-filter');
    const sortSelect = document.getElementById('flashcards-sort-filter');
    const trackSelect = document.getElementById('flashcards-track-filter');
    const difficultySelect = document.getElementById(
        'flashcards-difficulty-filter'
    );
    const perPageSelect = document.getElementById('cards-per-page-filter');

    if (viewSelect) viewSelect.value = viewFilterValue;
    if (sortSelect) sortSelect.value = sortFilterValue;
    if (trackSelect) trackSelect.value = trackFilterValue;
    if (difficultySelect) difficultySelect.value = difficultyFilterValue;
    if (perPageSelect) perPageSelect.value = cardsPerPage;

    // --- Reanexar event listeners ---
    setupFlashcardsEventListeners();
}

// Adicione esta nova função em app.js

function showTrackSelectionModal(nextAction) {
    const overlay = document.createElement('div');
    overlay.id = 'track-selection-modal';
    overlay.className = 'modal-overlay';

    // 1. Obter todas as trilhas com flashcards ativos
    const tracksWithCards = {};
    const activeCards = lexiaFlashcards.filter((card) => !card.isArchived);
    activeCards.forEach((card) => {
        const trackName = card.sourceTrack || 'Geral';
        if (!tracksWithCards[trackName]) {
            tracksWithCards[trackName] = { count: 0, displayName: trackName }; // Usar sourceTrack como displayName inicial
            // Tenta obter um nome mais amigável se for um arquivo conhecido
            const metadata = getTrackMetadata(trackName);
            if (metadata && metadata.displayName !== trackName) {
                tracksWithCards[trackName].displayName = metadata.displayName;
            }
        }
        tracksWithCards[trackName].count++;
    });

    const sortedTracks = Object.entries(tracksWithCards).sort(([, a], [, b]) =>
        a.displayName.localeCompare(b.displayName)
    );

    if (sortedTracks.length === 0) {
        showToast('Nenhum flashcard ativo disponível para revisão.', 3000);
        return;
    }

    // 2. Gerar HTML do Modal
    overlay.innerHTML = `
        <div class="modal-content track-select-content">
            <h3>Selecionar Trilhas para Revisão</h3>
            <p>Escolha uma ou mais trilhas para incluir na sua sessão:</p>
            <div class="track-selection-controls">
                 <button class="btn btn-secondary btn-small" id="select-all-tracks">Selecionar Todas</button>
                 <button class="btn btn-secondary btn-small" id="clear-all-tracks">Limpar Seleção</button>
            </div>
            <div class="track-checkboxes">
                ${sortedTracks
                    .map(
                        ([trackName, data]) => `
                    <label>
                        <input type="checkbox" class="track-select-checkbox" value="${trackName}" checked>
                        ${data.displayName} (${data.count})
                    </label>
                `
                    )
                    .join('')}
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary" id="cancel-track-select">Cancelar</button>
                <button class="btn btn-primary" id="confirm-track-select" disabled>
                    ${
                        nextAction === 'reviewAll'
                            ? 'Iniciar Revisão'
                            : 'Selecionar Dificuldades...'
                    }
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 3. Adicionar Event Listeners do Modal
    const checkboxes = overlay.querySelectorAll('.track-select-checkbox');
    const confirmButton = overlay.querySelector('#confirm-track-select');
    const selectAllBtn = overlay.querySelector('#select-all-tracks');
    const clearAllBtn = overlay.querySelector('#clear-all-tracks');

    function updateTotalSelectedCards() {
        let total = 0;
        checkboxes.forEach((cb) => {
            if (cb.checked) {
                total += tracksWithCards[cb.value]?.count || 0;
            }
        });
        confirmButton.disabled = total === 0;
        const buttonTextBase =
            nextAction === 'reviewAll'
                ? 'Iniciar Revisão'
                : 'Selecionar Dificuldades...';
        confirmButton.textContent =
            total > 0 ? `${buttonTextBase} (${total})` : buttonTextBase;
    }

    checkboxes.forEach((cb) =>
        cb.addEventListener('change', updateTotalSelectedCards)
    );
    selectAllBtn.addEventListener('click', () => {
        checkboxes.forEach((cb) => (cb.checked = true));
        updateTotalSelectedCards();
    });
    clearAllBtn.addEventListener('click', () => {
        checkboxes.forEach((cb) => (cb.checked = false));
        updateTotalSelectedCards();
    });

    overlay
        .querySelector('#cancel-track-select')
        .addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

    confirmButton.addEventListener('click', () => {
        const selectedTrackNames = Array.from(checkboxes)
            .filter((cb) => cb.checked)
            .map((cb) => cb.value);

        if (selectedTrackNames.length === 0) return; // Segurança extra

        // Filtra os cards APENAS das trilhas selecionadas
        const filteredByTrackCards = activeCards.filter((card) =>
            selectedTrackNames.includes(card.sourceTrack || 'Geral')
        );

        document.body.removeChild(overlay); // Fecha este modal

        // Decide a próxima ação
        if (nextAction === 'reviewAll') {
            startDeckReview(filteredByTrackCards, 'allSelectedTracks'); // Inicia a revisão com os cards filtrados
        } else if (nextAction === 'selectDifficulty') {
            showDifficultySelectionModal(filteredByTrackCards); // Abre o modal de dificuldade, passando os cards já filtrados por trilha
        }
    });

    overlay.addEventListener('click', (e) => {
        // Fechar ao clicar fora
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });

    // Estado inicial do botão
    updateTotalSelectedCards();
}

// app.js - SUBSTITUA a função showDifficultySelectionModal inteira por esta

function showDifficultySelectionModal(
    filteredByTrackCards,
    selectedTrackNames
) {
    // <-- Recebe a lista já filtrada por trilha
    const overlay = document.createElement('div');
    overlay.id = 'difficulty-selection-modal';
    overlay.className = 'modal-overlay';

    // Calcula contagens baseado nos cards já filtrados por trilha
    const counts = {
        easy: (filteredByTrackCards || []).filter(
            (c) => c.difficultyLevel === 'easy'
        ).length,
        medium: (filteredByTrackCards || []).filter(
            (c) => c.difficultyLevel === 'medium'
        ).length,
        difficult: (filteredByTrackCards || []).filter(
            (c) => c.difficultyLevel === 'difficult'
        ).length,
        unrated: (filteredByTrackCards || []).filter((c) => !c.difficultyLevel)
            .length,
    };

    // ===== CORREÇÃO: Adiciona verificação para selectedTrackNames =====
    const safeSelectedTrackNames = Array.isArray(selectedTrackNames)
        ? selectedTrackNames
        : [];
    // Formata a lista de trilhas selecionadas para exibição
    const selectedTracksDisplay = safeSelectedTrackNames
        .map((name) => {
            // Tenta pegar o nome amigável, senão usa o nome do arquivo/chave
            const metadata = getTrackMetadata(name); // Assume que getTrackMetadata existe
            return metadata && metadata.displayName !== name
                ? metadata.displayName
                : name; // Mostra displayName se diferente
        })
        .join(', ');
    // ================================================================

    // Verifica se há cards filtrados por trilha para continuar
    if (!filteredByTrackCards || filteredByTrackCards.length === 0) {
        console.warn(
            '[Modal Dificuldade] Nenhum card encontrado após filtro de trilha. Abortando modal.'
        );
        showToast(
            'Nenhum flashcard encontrado para as trilhas selecionadas.',
            3000
        );
        // Não cria o modal se não houver cards
        return;
    }

    overlay.innerHTML = `
        <div class="modal-content difficulty-select-content">
            <h3>Revisar por Dificuldade</h3>

            ${
                safeSelectedTrackNames.length > 0
                    ? `
            <div class="selected-tracks-info">
                <strong>Trilhas Selecionadas:</strong> ${
                    selectedTracksDisplay || 'Nenhuma'
                }
            </div>
            `
                    : ''
            }

            <p>Selecione as dificuldades que deseja incluir na revisão (baseado nas trilhas selecionadas):</p>
            <div class="difficulty-checkboxes">
                <label style="${
                    counts.easy === 0 ? 'opacity: 0.6; cursor: default;' : ''
                }">
                    <input type="checkbox" value="easy" ${
                        counts.easy > 0 ? 'checked' : ''
                    } ${counts.easy === 0 ? 'disabled' : ''}>
                    Fácil (${counts.easy})
                </label>
                <label style="${
                    counts.medium === 0 ? 'opacity: 0.6; cursor: default;' : ''
                }">
                    <input type="checkbox" value="medium" ${
                        counts.medium > 0 ? 'checked' : ''
                    } ${counts.medium === 0 ? 'disabled' : ''}>
                    Médio (${counts.medium})
                </label>
                <label style="${
                    counts.difficult === 0
                        ? 'opacity: 0.6; cursor: default;'
                        : ''
                }">
                    <input type="checkbox" value="difficult" ${
                        counts.difficult > 0 ? 'checked' : ''
                    } ${counts.difficult === 0 ? 'disabled' : ''}>
                    Difícil (${counts.difficult})
                </label>
                 <label style="${
                     counts.unrated === 0
                         ? 'opacity: 0.6; cursor: default;'
                         : ''
                 }">
                    <input type="checkbox" value="unrated" ${
                        counts.unrated > 0 ? 'checked' : ''
                    } ${counts.unrated === 0 ? 'disabled' : ''}>
                    Não Classificado (${counts.unrated})
                </label>
            </div>
            <div class="modal-actions">
                 <button class="btn btn-secondary" id="back-to-track-select">← Voltar (Trilhas)</button>
                <button class="btn btn-secondary" id="cancel-difficulty-select">Cancelar</button>
                <button class="btn btn-primary" id="start-difficulty-review" disabled>Iniciar Revisão</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Event listeners do modal
    const startButton = overlay.querySelector('#start-difficulty-review');
    const checkboxes = overlay.querySelectorAll(
        '.difficulty-checkboxes input[type="checkbox"]:not(:disabled)'
    ); // Seleciona apenas os habilitados
    const backButton = overlay.querySelector('#back-to-track-select');

    overlay
        .querySelector('#cancel-difficulty-select')
        .addEventListener('click', () => {
            if (overlay.parentNode) document.body.removeChild(overlay);
        });

    startButton.addEventListener('click', () => {
        const selectedDifficulties = [];
        checkboxes.forEach((checkbox) => {
            if (checkbox.checked) {
                // Converte 'unrated' para null, mantém os outros como string
                selectedDifficulties.push(
                    checkbox.value === 'unrated' ? null : checkbox.value
                );
            }
        });

        if (selectedDifficulties.length === 0) return; // Segurança

        if (overlay.parentNode) document.body.removeChild(overlay); // Fecha este modal

        // Chama a função para iniciar a revisão com os cards filtrados por trilha E dificuldade
        startFilteredDeckReview(selectedDifficulties, filteredByTrackCards);
    });

    // Lógica do botão Voltar
    backButton.addEventListener('click', () => {
        if (overlay.parentNode) document.body.removeChild(overlay); // Fecha o modal atual
        showTrackSelectionModal('selectDifficulty'); // Reabre o modal de seleção de trilha
    });

    overlay.addEventListener('click', (e) => {
        // Fechar ao clicar fora
        if (e.target === overlay) {
            if (overlay.parentNode) document.body.removeChild(overlay);
        }
    });

    // Função interna para atualizar estado do botão Iniciar
    function checkStartButtonState() {
        let totalSelectedCards = 0;
        checkboxes.forEach((cb) => {
            if (cb.checked) {
                // Usa o valor do checkbox ('easy', 'medium', 'difficult', 'unrated') para buscar a contagem
                totalSelectedCards += counts[cb.value] || 0;
            }
        });
        startButton.disabled = totalSelectedCards === 0;
        startButton.textContent =
            totalSelectedCards > 0
                ? `Iniciar Revisão (${totalSelectedCards})`
                : 'Iniciar Revisão';
    }

    // Adiciona listener e ajusta estado inicial dos checkboxes
    checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', checkStartButtonState);
    });

    // Verifica o estado inicial do botão
    checkStartButtonState();
}

// Adicione esta nova função em app.js

// Modifique a função startFilteredDeckReview

function startFilteredDeckReview(selectedDifficulties, baseCardList) {
    // <-- Aceita a lista base
    // Filtra a lista BASE (já filtrada por trilha) pela dificuldade
    const finalFilteredCards = baseCardList.filter((card) =>
        selectedDifficulties.includes(card.difficultyLevel)
    );

    if (finalFilteredCards.length === 0) {
        showToast(
            'Nenhum flashcard encontrado com as dificuldades e trilhas selecionadas.',
            3000
        );
        return;
    }

    startDeckReview(finalFilteredCards, 'filtered'); // Chama o deck com a lista final
}

function startDeckReview(cardList = null, reviewType = 'all') {
    // Assinatura atualizada
    // Se cardList não foi passado, filtra os ativos. Senão, usa a lista fornecida.
    const cardsToReview = cardList
        ? cardList
        : lexiaFlashcards.filter((card) => !card.isArchived);

    if (cardsToReview.length === 0) {
        showToast('Nenhum flashcard encontrado para esta revisão.', 3000); // Mensagem genérica
        return;
    }

    let currentIndex = 0;
    let isFlipped = false;
    const overlay = document.createElement('div');
    overlay.id = 'deck-review-overlay';
    overlay.className = 'modal-overlay deck-review-modal';

    // Dentro da função startDeckReview...

    function renderReviewCard(index) {
        const card = cardsToReview[index];
        isFlipped = false; // Reset flip state when changing cards

        const cardRef = card.articleReference || `Flashcard ${index + 1}`;
        const sourceText = card.sourceTrack || 'Geral';
        const currentDifficulty = card.difficultyLevel || 'unrated';
        const difficultyLabel = getDifficultyLabel(currentDifficulty); // Usa a função auxiliar
        const difficultyClass = currentDifficulty
            ? `difficulty-${currentDifficulty}`
            : 'difficulty-unrated';

        // ===== VERIFIQUE O HTML ABAIXO, ESPECIALMENTE O BOTÃO COM A CLASSE 'flip-deck-card-btn' =====
        overlay.innerHTML = `
            <div class="deck-review-container">
                <div class="deck-header">
                    <h3>${getReviewTypeLabel(reviewType)}</h3>
                    <span class="card-counter">${index + 1} / ${
            cardsToReview.length
        }</span>
                    <button class="btn-icon close-deck-btn" title="Fechar Revisão">✖</button>
                </div>

                <div class="deck-card ${
                    isFlipped ? 'is-flipped' : ''
                }" id="deck-card-current">
                    <div class="card-face card-face--front">
                        <div class="card-content">
                            <small class="card-ref">${cardRef} <span class="difficulty-indicator ${difficultyClass}">${
            difficultyLabel || 'Não Classificado'
        }</span></small>
                            <h4>Pergunta:</h4>
                            <p>${card.question.replace(
                                /\n/g,
                                '<br>'
                            )}</p> <small class="card-source-deck">Fonte: ${sourceText}</small>
                        </div>
                        <button class="btn btn-primary flip-deck-card-btn">Mostrar Resposta</button>
                    </div>
                    <div class="card-face card-face--back">
                        <div class="card-content">
                             <small class="card-ref">${cardRef} <span class="difficulty-indicator ${difficultyClass}">${
            difficultyLabel || 'Não Classificado'
        }</span></small>
                             <h4>Resposta:</h4>
                             <p>${card.answer.replace(
                                 /\n/g,
                                 '<br>'
                             )}</p> <small class="card-source-deck">Fonte: ${sourceText}</small>
                        </div>
                        <div class="difficulty-rating-buttons">
                             <p>Classifique este card:</p>
                             <button class="btn btn-difficulty btn-easy" data-difficulty="easy">Fácil</button>
                             <button class="btn btn-difficulty btn-medium" data-difficulty="medium">Médio</button>
                             <button class="btn btn-difficulty btn-difficult" data-difficulty="difficult">Difícil</button>
                        </div>
                    </div>
                </div>

                <div class="deck-navigation">
                    <button class="btn btn-secondary prev-card-btn" ${
                        index === 0 ? 'disabled' : ''
                    }>← Anterior</button>
                    <button class="btn btn-secondary next-card-btn" ${
                        index === cardsToReview.length - 1 ? 'disabled' : ''
                    }>Próxima →</button>
                </div>
            </div>
        `;
        // ===== FIM DA VERIFICAÇÃO HTML =====

        // ===== CORREÇÃO: Adicionar verificação antes de addEventListener =====
        const flipButton = overlay.querySelector('.flip-deck-card-btn');
        if (flipButton) {
            flipButton.addEventListener('click', () => flipCard(true));
        } else {
            console.error(
                "ERRO: Botão '.flip-deck-card-btn' não encontrado no HTML renderizado dentro de renderReviewCard."
            );
        }
        // =====================================================================

        overlay
            .querySelector('.close-deck-btn')
            .addEventListener('click', closeDeck);

        overlay
            .querySelectorAll('.difficulty-rating-buttons button')
            .forEach((button) => {
                button.addEventListener('click', (e) => {
                    const difficulty = e.target.dataset.difficulty;
                    rateCard(card.id, difficulty);
                    showNextCardOrClose();
                });
            });

        const prevBtn = overlay.querySelector('.prev-card-btn');
        const nextBtn = overlay.querySelector('.next-card-btn');

        if (prevBtn && !prevBtn.disabled) {
            prevBtn.addEventListener('click', () => {
                if (currentIndex > 0) {
                    currentIndex--;
                    renderReviewCard(currentIndex);
                }
            });
        }
        if (nextBtn && !nextBtn.disabled) {
            nextBtn.addEventListener('click', showNextCardOrClose);
        }
    } // Fim da função renderReviewCard

    function flipCard(showAnswer) {
        const cardElement = overlay.querySelector('#deck-card-current');
        if (showAnswer && !isFlipped) {
            const currentCardData = cardsToReview[currentIndex];
            currentCardData.viewCount = (currentCardData.viewCount || 0) + 1;
            // Salva apenas a contagem de visualização
            const cardIndex = lexiaFlashcards.findIndex(
                (c) => c.id === currentCardData.id
            );
            if (cardIndex !== -1) {
                lexiaFlashcards[cardIndex].viewCount =
                    currentCardData.viewCount;
                saveFlashcards();
            }
            isFlipped = true;
            cardElement.classList.add('is-flipped');
        }
    }

    function rateCard(cardId, difficulty) {
        const cardIndex = lexiaFlashcards.findIndex((c) => c.id === cardId);
        if (cardIndex !== -1) {
            lexiaFlashcards[cardIndex].difficultyLevel = difficulty;
            saveFlashcards(); // Salva a dificuldade escolhida
            console.log(`Card ${cardId} classificado como: ${difficulty}`);
        }
    }

    function showNextCardOrClose() {
        currentIndex++;
        if (currentIndex >= cardsToReview.length) {
            closeDeck(true); // Fim da revisão
        } else {
            renderReviewCard(currentIndex); // Mostra o próximo
        }
    }

    function closeDeck(completed = false) {
        if (overlay.parentNode) {
            document.body.removeChild(overlay);
        }
        if (completed) {
            showToast(
                `🎉 Você revisou ${cardsToReview.length} flashcard(s)!`,
                3000
            );
        }
        renderFlashcards(); // Atualiza a lista principal
    }

    // Renderiza o primeiro card e adiciona o overlay
    renderReviewCard(currentIndex);
    document.body.appendChild(overlay);
}

// Adicionar em app.js

function showArticleContentModal(articleId, trackFileName) {
    const article = findArticleById(articleId, trackFileName);
    if (!article) {
        alert('Artigo não encontrado.');
        return;
    }

    // Cria o overlay do modal
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    // Cria o conteúdo do modal
    modalOverlay.innerHTML = `
        <div class="modal-content article-modal-content">
            <div class="modal-header">
                <h3>${article.fullReference}</h3>
                <button class="btn-icon close-modal-btn" title="Fechar">✖</button>
            </div>
            <div class="modal-body">
                <p><strong>Lei:</strong> ${article.law}</p>
                <p><strong>Assunto:</strong> ${article.subject}</p>
                <hr>
                <div class="article-full-text">
                    ${article.fullText.replace(/\n/g, '<br>')}
                </div>
            </div>
        </div>
    `;

    // Adiciona o modal ao corpo do documento
    document.body.appendChild(modalOverlay);

    // Adiciona evento para fechar o modal
    modalOverlay
        .querySelector('.close-modal-btn')
        .addEventListener('click', () => {
            document.body.removeChild(modalOverlay);
        });

    // Opcional: fechar ao clicar fora do conteúdo
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            document.body.removeChild(modalOverlay);
        }
    });
}

// SUBSTITUA A FUNÇÃO 'setupFlashcardsEventListeners' INTEIRA POR ESTA:

function setupFlashcardsEventListeners() {
    console.log('Configurando event listeners dos flashcards...');
    const flashcardArea = document.getElementById('flashcard-area');
    if (!flashcardArea) {
        console.error('ERRO: Elemento #flashcard-area não encontrado.');
        return;
    }

    // 1. Clonagem para limpar listeners antigos
    const newFlashcardArea = flashcardArea.cloneNode(true);
    if (flashcardArea.parentNode) {
        flashcardArea.parentNode.replaceChild(newFlashcardArea, flashcardArea);
    } else {
        console.error(
            'ERRO: #flashcard-area não tem nó pai para substituição.'
        );
        return;
    }

    // 2. Listener de CLIQUE principal (com delegação)
    newFlashcardArea.addEventListener('click', (e) => {
        const target = e.target;
        const targetId = target.id; // ID do elemento clicado
        const closestCard = target.closest('.flashcard-card'); // Card pai mais próximo
        const flashcardId = closestCard
            ? closestCard.dataset.flashcardId
            : null; // ID do card, se houver

        // Botão Gerar Novos Flashcards
        if (targetId === 'generate-selected-flashcards') {
            generateSelectedFlashcards();
            return;
        }

        // Botão Revisar Todos
        if (targetId === 'review-all-btn') {
            showTrackSelectionModal('reviewAll');
            return;
        }

        // Botão Revisar por Dificuldade
        if (targetId === 'review-by-difficulty-btn') {
            showTrackSelectionModal('selectDifficulty');
            return;
        }

        // Botão para Mostrar/Esconder Filtros (Mobile)
        if (targetId === 'toggle-filters-btn') {
            const filtersPanel = newFlashcardArea.querySelector(
                '#collapsible-filters'
            );
            const buttonSpan = target.querySelector('span'); // A seta
            if (filtersPanel) {
                // Verifica o estilo computado para saber o estado real, especialmente em mobile
                const isCurrentlyVisible =
                    window.getComputedStyle(filtersPanel).display !== 'none';
                filtersPanel.style.display = isCurrentlyVisible
                    ? 'none'
                    : 'grid'; // Alterna
                buttonSpan.textContent = isCurrentlyVisible ? '▾' : '▴'; // Muda a seta
            }
            return;
        }

        // Botão Ler Artigo (na seção de geração)
        const readBtn = target.closest('.read-article-btn');
        if (readBtn) {
            const articleId = readBtn.dataset.articleId;
            const track = readBtn.dataset.track;
            if (articleId && track) {
                showArticleContentModal(articleId, track);
            }
            return;
        }

        // Ações dentro de um card individual
        if (flashcardId) {
            if (target.closest('.favorite-btn')) {
                toggleFlashcardFavorite(flashcardId);
                return;
            }
            if (target.closest('.archive-btn')) {
                toggleFlashcardArchive(flashcardId);
                return;
            }
            if (target.closest('.edit-btn')) {
                editFlashcardName(flashcardId);
                return;
            }
            if (target.closest('.delete-btn')) {
                deleteFlashcard(flashcardId);
                return;
            }
            // Botão Revisar Agora (individual)
            if (target.closest('.review-btn')) {
                const card = lexiaFlashcards.find((c) => c.id === flashcardId);
                if (card) startFlashcardReview([card], 'single'); // Chama a função atualizada
                return;
            }
        }
    });

    // 3. Listener de MUDANÇA (filtros, checkboxes)
    newFlashcardArea.addEventListener('change', (e) => {
        const target = e.target;
        const targetId = target.id;

        // Mostrar/ocultar campo de foco personalizado
        if (targetId === 'generation-focus') {
            const customGroup = newFlashcardArea.querySelector(
                '#custom-focus-group'
            );
            if (customGroup) {
                customGroup.style.display =
                    target.value === 'specific' ? 'block' : 'none';
            }
            return;
        }

        // Aplicar filtros da lista principal (incluindo o novo filtro e paginação)
        if (
            targetId === 'flashcards-view-filter' ||
            targetId === 'flashcards-sort-filter' ||
            targetId === 'flashcards-track-filter' ||
            targetId === 'flashcards-difficulty-filter' ||
            targetId === 'cards-per-page-filter'
        ) {
            console.log('Filtro alterado:', targetId, target.value);
            // Ao mudar filtro ou itens por página, volta para a primeira página
            newFlashcardArea.dataset.currentPage = 1;
            renderFlashcards(); // Re-renderiza a lista com os filtros aplicados
            return;
        }
    });

    // 4. Funcionalidade do ACCORDION (mantida)
    const allDetails = newFlashcardArea.querySelectorAll(
        '.track-selection-group'
    );
    allDetails.forEach((details) => {
        details.addEventListener('toggle', (event) => {
            if (event.target.open) {
                allDetails.forEach((otherDetails) => {
                    if (otherDetails !== event.target) {
                        otherDetails.open = false;
                    }
                });
            }
        });
    });

    // 5. Listeners da Paginação (botões Anterior/Próxima)
    const prevBtn = newFlashcardArea.querySelector('#prev-page-btn');
    const nextBtn = newFlashcardArea.querySelector('#next-page-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            let currentPage = parseInt(
                newFlashcardArea.dataset.currentPage || 1
            );
            if (currentPage > 1) {
                newFlashcardArea.dataset.currentPage = currentPage - 1;
                renderFlashcards(); // Re-renderiza a página anterior
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            let currentPage = parseInt(
                newFlashcardArea.dataset.currentPage || 1
            );
            // Pega o total de páginas da string exibida (Ex: "Página 1 de 5")
            const totalPagesText =
                newFlashcardArea.querySelector('.page-info')?.textContent || '';
            const match = totalPagesText.match(/de (\d+)/);
            const totalPages = match ? parseInt(match[1]) : 1;

            if (currentPage < totalPages) {
                newFlashcardArea.dataset.currentPage = currentPage + 1;
                renderFlashcards(); // Re-renderiza a próxima página
            }
        });
    }
}

// Adicione esta função auxiliar para debug dos filtros:
function debugFilters() {
    const viewFilter = document.getElementById('flashcards-view-filter');
    const sortFilter = document.getElementById('flashcards-sort-filter');
    const trackFilter = document.getElementById('flashcards-track-filter');

    console.log('Filtros encontrados:', {
        viewFilter: viewFilter ? viewFilter.value : 'não encontrado',
        sortFilter: sortFilter ? sortFilter.value : 'não encontrado',
        trackFilter: trackFilter ? trackFilter.value : 'não encontrado',
    });
}

function renderFlashcardsList(flashcards, flashcardPositionMap = {}) {
    console.log(
        `[DEBUG] renderFlashcardsList recebendo ${
            flashcards?.length || 0
        } cards para exibir.`
    );

    if (!flashcards || flashcards.length === 0) {
        return '<p class="no-items">Nenhum flashcard encontrado para os filtros selecionados.</p>';
    }

    // Função auxiliar local para obter label de dificuldade
    function getDifficultyLabel(level) {
        switch (level) {
            case 'easy':
                return 'Fácil';
            case 'medium':
                return 'Médio';
            case 'difficult':
                return 'Difícil';
            default:
                return null;
        }
    }

    return flashcards
        .map((card, index) => {
            if (!card || typeof card !== 'object') {
                console.warn(
                    `[DEBUG] Item inválido no índice ${index} foi ignorado:`,
                    card
                );
                return '';
            }

            const safeCard = {
                id: card.id || `missing-id-${Date.now()}-${index}`,
                question: card.question || '[Pergunta não disponível]',
                answer: card.answer || '[Resposta não disponível]',
                customName: card.customName || '',
                sourceTrack: card.sourceTrack || 'Geral',
                viewCount: card.viewCount || 0,
                isFavorite: card.isFavorite || false,
                isArchived: card.isArchived || false,
                created: card.created || new Date().toISOString(),
                articleReference: card.articleReference || '',
                difficultyLevel: card.difficultyLevel || null,
            };

            let displayName =
                safeCard.customName ||
                safeCard.articleReference ||
                safeCard.question.substring(0, 70) +
                    (safeCard.question.length > 70 ? '...' : '');
            const position = flashcardPositionMap[safeCard.id];
            if (position > 1) {
                displayName += ` <sup>${position}</sup>`;
            }

            const difficultyLevel = safeCard.difficultyLevel;
            const difficultyLabel = getDifficultyLabel(difficultyLevel);
            const difficultyClass = difficultyLevel
                ? `difficulty-${difficultyLevel}`
                : 'difficulty-unrated';

            return `
            <div class="flashcard-card ${
                safeCard.isFavorite ? 'favorite' : ''
            } ${safeCard.isArchived ? 'archived' : ''}" data-flashcard-id="${
                safeCard.id
            }">
                
                <div class="flashcard-header">
                    <div class="flashcard-title-area">
                        <h4 class="flashcard-title" title="${
                            safeCard.question
                        }">${displayName}</h4>
                        ${
                            difficultyLabel
                                ? `<span class="difficulty-badge ${difficultyClass}">${difficultyLabel}</span>`
                                : ''
                        } 
                    </div>
                    <div class="flashcard-actions">
                        <button class="flashcard-action-btn favorite-btn" title="${
                            safeCard.isFavorite ? 'Desfavoritar' : 'Favoritar'
                        }">${safeCard.isFavorite ? '⭐' : '☆'}</button>
                        <button class="flashcard-action-btn edit-btn" title="Editar nome">✏️</button>
                        <button class="flashcard-action-btn archive-btn" title="${
                            safeCard.isArchived ? 'Desarquivar' : 'Arquivar'
                        }">${safeCard.isArchived ? '📂' : '📁'}</button>
                        <button class="flashcard-action-btn delete-btn" title="Excluir">🗑️</button>
                    </div>
                </div>

                <div class="flashcard-footer">
                   <div class="flashcard-meta">
                        <span class="meta-item source" title="Trilha de Origem">📚 ${
                            safeCard.sourceTrack
                        }</span>
                        <span class="meta-item views" title="Visualizações">👁️ ${
                            safeCard.viewCount
                        }</span>
                    </div>
                    <button class="btn btn-primary review-btn">Revisar Agora</button> 
                </div>

            </div>
            `;
        })
        .join('');
}

// Adicione esta função para forçar a atualização dos filtros:
function forceFilterUpdate() {
    const viewFilter = document.getElementById('flashcards-view-filter');
    const sortFilter = document.getElementById('flashcards-sort-filter');
    const trackFilter = document.getElementById('flashcards-track-filter');

    if (viewFilter) viewFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'recent';
    if (trackFilter) trackFilter.value = 'all';

    renderFlashcards();
}

// Substitua as funções existentes em app.js por estas:

function toggleFlashcardFavorite(flashcardId) {
    const flashcard = lexiaFlashcards.find((f) => f.id === flashcardId);
    if (flashcard) {
        flashcard.isFavorite = !flashcard.isFavorite;
        saveFlashcards();

        // Atualização direta no DOM
        const cardElement = document.querySelector(
            `.flashcard-card[data-flashcard-id="${flashcardId}"]`
        );
        if (cardElement) {
            cardElement.classList.toggle('favorite', flashcard.isFavorite);
            const favButton = cardElement.querySelector('.favorite-btn');
            favButton.innerHTML = flashcard.isFavorite ? '⭐' : '☆';
            favButton.title = flashcard.isFavorite
                ? 'Desfavoritar'
                : 'Favoritar';
        }
        updateFlashcardStats();
    }
}

// app.js - Substitua a função inteira por esta

// app.js - Substitua a função inteira por esta

// app.js - Substitua a função inteira por esta versão corrigida

function toggleFlashcardArchive(flashcardId) {
    const flashcard = lexiaFlashcards.find((f) => f.id === flashcardId);
    if (!flashcard) return;

    // 1. Inverte o estado de arquivamento nos dados
    flashcard.isArchived = !flashcard.isArchived;
    saveFlashcards();

    // 2. Encontra o elemento do card na tela
    const cardElement = document.querySelector(
        `.flashcard-card[data-flashcard-id="${flashcardId}"]`
    );
    if (!cardElement) return;

    // 3. ATUALIZAÇÃO IMEDIATA DO ÍCONE E TÍTULO (CORREÇÃO CRÍTICA)
    // Isso acontece ANTES da lógica de remoção, garantindo feedback visual.
    const archiveButton = cardElement.querySelector('.archive-btn');
    if (archiveButton) {
        archiveButton.innerHTML = flashcard.isArchived ? '📂' : '📁';
        archiveButton.title = flashcard.isArchived ? 'Desarquivar' : 'Arquivar';
    }

    // 4. Atualiza os contadores no cabeçalho
    updateFlashcardStats();

    // 5. LÓGICA DE REMOÇÃO VISUAL (agora separada e mais confiável)
    const currentFilter = document.getElementById(
        'flashcards-view-filter'
    )?.value;

    // Verifica se o card não pertence mais à visão atual e deve ser removido
    if (
        (currentFilter === 'archived' && !flashcard.isArchived) ||
        (currentFilter !== 'archived' && flashcard.isArchived)
    ) {
        // Aplica a classe para a animação de "saída"
        cardElement.classList.add('card-removing');

        // Remove o elemento do DOM após a animação de 500ms
        setTimeout(() => {
            cardElement.remove();

            // Se a página ficar vazia, redesenha para mostrar a mensagem correta
            if (document.querySelectorAll('.flashcard-card').length === 0) {
                renderFlashcards();
            }
        }, 500);
    }
}

function editFlashcardName(flashcardId) {
    const flashcard = lexiaFlashcards.find((f) => f.id === flashcardId);
    if (flashcard) {
        const newName = prompt(
            'Digite o novo nome para o flashcard:',
            flashcard.customName ||
                flashcard.articleReference ||
                flashcard.question.substring(0, 50)
        );
        if (newName && newName.trim() !== '') {
            flashcard.customName = newName.trim();
            saveFlashcards();

            // Atualização direta no DOM
            const cardElement = document.querySelector(
                `.flashcard-card[data-flashcard-id="${flashcardId}"]`
            );
            if (cardElement) {
                const titleElement =
                    cardElement.querySelector('.flashcard-title');
                // Mantém o 'sup' se ele existir
                const supElement = titleElement.querySelector('sup');
                titleElement.innerHTML =
                    flashcard.customName +
                    (supElement ? supElement.outerHTML : '');
            }
        }
    }
}

function deleteFlashcard(flashcardId) {
    if (
        confirm(
            'Tem certeza que deseja excluir este flashcard? Esta ação não pode ser desfeita.'
        )
    ) {
        lexiaFlashcards = lexiaFlashcards.filter((f) => f.id !== flashcardId);
        saveFlashcards();

        // Atualização direta no DOM
        const cardElement = document.querySelector(
            `.flashcard-card[data-flashcard-id="${flashcardId}"]`
        );
        if (cardElement) {
            cardElement.classList.add('card-removing');
            setTimeout(() => {
                cardElement.remove();
                if (document.querySelectorAll('.flashcard-card').length === 0) {
                    renderFlashcards();
                }
            }, 500);
        }
        updateFlashcardStats();
    }
}

function reviewSingleFlashcard(flashcardId) {
    const flashcard = lexiaFlashcards.find((f) => f.id === flashcardId);
    if (flashcard) {
        // **CORREÇÃO**: Não incrementa viewCount aqui - será feito na revisão
        startFlashcardReview([flashcard], 'single');
    }
}

async function generateSelectedFlashcards() {
    const selectedCheckboxes = document.querySelectorAll(
        '.article-checkbox:checked'
    );
    if (selectedCheckboxes.length === 0) {
        alert('Selecione pelo menos um artigo para gerar flashcards.');
        return;
    }

    const focus = document.getElementById('generation-focus').value;
    const specificFocus =
        focus === 'specific'
            ? document.getElementById('custom-focus').value
            : '';
    const style = document.getElementById('flashcard-style').value;

    if (focus === 'specific' && !specificFocus.trim()) {
        alert('Digite o foco específico para a geração dos flashcards.');
        return;
    }

    const generateBtn = document.getElementById('generate-selected-flashcards');
    const originalText = generateBtn.textContent;
    generateBtn.textContent = '🔄 Gerando...';
    generateBtn.disabled = true;

    let generatedCount = 0;
    const errors = [];

    for (const checkbox of selectedCheckboxes) {
        const articleId = checkbox.dataset.articleId;
        const track = checkbox.dataset.track;

        // Encontrar o artigo
        const article = findArticleById(articleId);

        if (article) {
            try {
                const flashcard = await generateFlashcardFromArticle(
                    article,
                    focus,
                    specificFocus,
                    style
                );
                if (flashcard) {
                    generatedCount++;
                } else {
                    errors.push(`Falha ao gerar para ${article.fullReference}`);
                }
            } catch (error) {
                errors.push(
                    `Erro em ${article.fullReference}: ${error.message}`
                );
            }

            // Pequena pausa para evitar rate limiting
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    generateBtn.textContent = originalText;
    generateBtn.disabled = false;

    let message = `✅ ${generatedCount} flashcards gerados com sucesso!`;
    if (errors.length > 0) {
        message += `\n\nErros (${errors.length}):\n${errors
            .slice(0, 3)
            .join('\n')}`;
        if (errors.length > 3)
            message += `\n... e mais ${errors.length - 3} erros`;
    }

    alert(message);
    renderFlashcards();
}

// app.js - SUBSTITUA a função findArticleById existente por esta

/**
 * @function findArticleById
 * @description Encontra um objeto de artigo completo dentro de lexiaChunks pelo seu ID único.
 * Primeiro tenta a busca direta e depois um fallback baseado no formato do ID.
 * @param {string} articleId - O ID único do artigo a ser encontrado (formato: article-nome_arquivo-numero).
 * @returns {object|null} O objeto completo do artigo (incluindo fullText, etc.) ou null se não encontrado.
 */
function findArticleById(articleId) {
    console.log(`[findArticleById] Buscando ID: ${articleId}`);
    if (!articleId) {
        console.warn(
            '[findArticleById] ID do artigo fornecido é inválido (null ou vazio).'
        );
        return null;
    }

    // --- 1. Busca Direta (Método Preferencial) ---
    for (const chunk of lexiaChunks) {
        if (chunk.legalArticles && Array.isArray(chunk.legalArticles)) {
            for (const article of chunk.legalArticles) {
                // Comparação direta e exata do ID
                if (article && article.id === articleId) {
                    console.log(
                        `[findArticleById] Artigo encontrado DIRETAMENTE no chunk ${chunk.id}:`,
                        {
                            id: article.id,
                            ref: article.fullReference,
                            law: article.law,
                        }
                    );
                    // Retorna o objeto completo do artigo, garantindo as propriedades necessárias
                    return {
                        id: article.id,
                        number: article.number || '',
                        fullReference:
                            article.fullReference || `Art. ${article.number}`,
                        law: article.law || chunk.file.replace('.pdf', ''),
                        subject: article.subject || 'Assunto não definido',
                        fullText: article.fullText || '', // Crucial para a geração
                        paragraphs: article.paragraphs || [],
                        context: article.context || '',
                        chunkId: chunk.id, // Adiciona o ID do chunk de origem
                        fileName: chunk.file, // Adiciona o nome do arquivo de origem
                    };
                }
            }
        } else if (chunk.legalArticles) {
            // Log se legalArticles não for um array (pode indicar problema nos dados)
            console.warn(
                `[findArticleById] Propriedade 'legalArticles' no chunk ${chunk.id} não é um array.`
            );
        }
    }
    console.log(
        `[findArticleById] Busca direta pelo ID "${articleId}" falhou em todos os chunks.`
    );

    // --- 2. Fallback (Tentativa Baseada no Formato do ID) ---
    // Tenta extrair informações do ID para busca alternativa (menos confiável)
    // Formato esperado: article-nome_arquivo-numero
    const idParts = articleId.split('-');
    // Precisa de pelo menos 'article', 'nomearquivo', 'numero'
    if (idParts.length >= 3 && idParts[0] === 'article') {
        const possibleArticleNumber = idParts[idParts.length - 1]; // Última parte
        // Junta as partes do meio que podem formar o nome do arquivo (lidando com hífens no nome)
        const possibleFileNameIdentifier = idParts.slice(1, -1).join('-');

        console.log(
            `[findArticleById] Tentando fallback com Número: ${possibleArticleNumber}, Identificador Arquivo: ${possibleFileNameIdentifier}`
        );

        for (const chunk of lexiaChunks) {
            // Verifica se o identificador do arquivo no ID corresponde ao nome do arquivo do chunk (após tratamento similar)
            const chunkFileIdentifier = chunk.file.replace(
                /[^a-zA-Z0-9]/g,
                '_'
            ); // Tratamento similar ao da geração de ID

            if (
                chunk.legalArticles &&
                chunkFileIdentifier.includes(possibleFileNameIdentifier)
            ) {
                console.log(
                    `[findArticleById Fallback] Verificando chunk ${chunk.id} (arquivo: ${chunk.file})`
                );
                for (const article of chunk.legalArticles) {
                    // Compara o número do artigo extraído do ID com o número no objeto do artigo
                    if (article && article.number === possibleArticleNumber) {
                        console.warn(
                            `[findArticleById] Artigo encontrado via FALLBACK no chunk ${chunk.id}:`,
                            {
                                id: article.id,
                                ref: article.fullReference,
                                number: article.number,
                            }
                        );
                        // Retorna o objeto completo
                        return {
                            id: article.id, // Usa o ID real encontrado
                            number: article.number,
                            fullReference:
                                article.fullReference ||
                                `Art. ${article.number}`,
                            law: article.law || chunk.file.replace('.pdf', ''),
                            subject: article.subject || 'Assunto não definido',
                            fullText: article.fullText || '',
                            paragraphs: article.paragraphs || [],
                            context: article.context || '',
                            chunkId: chunk.id,
                            fileName: chunk.file,
                        };
                    }
                }
            }
        }
    } else {
        console.log(
            `[findArticleById] Formato do ID "${articleId}" não permite fallback.`
        );
    }

    // --- 3. Não Encontrado ---
    console.error(
        `[findArticleById] ARTIGO NÃO ENCONTRADO após todas as tentativas: ${articleId}`
    );
    // Opcional: Listar todos os IDs disponíveis para depuração
    // console.log("[findArticleById DEBUG] IDs disponíveis em lexiaChunks:", lexiaChunks.flatMap(c => c.legalArticles || []).map(a => a.id));
    return null; // Retorna null se não encontrar de nenhuma forma
}

function getUniqueFlashcardSources() {
    const sources = new Set();
    lexiaFlashcards.forEach((card) => {
        const chunk = lexiaChunks.find((c) => c.id === card.chunkId);
        if (chunk) {
            sources.add(chunk.file);
        }
    });
    return Array.from(sources);
}

function filterFlashcards(source) {
    const flashcardGrid = document.querySelector('.flashcard-grid');
    let filteredCards = lexiaFlashcards;

    if (source !== 'all') {
        filteredCards = lexiaFlashcards.filter((card) => {
            const chunk = lexiaChunks.find((c) => c.id === card.chunkId);
            return chunk && chunk.file === source;
        });
    }

    flashcardGrid.innerHTML = filteredCards
        .slice(0, 6)
        .map((card) => {
            const chunk = lexiaChunks.find((c) => c.id === card.chunkId);
            const cardSource = chunk ? chunk.file : 'Desconhecido';
            const difficulty =
                card.easiness < 2.0
                    ? 'Difícil'
                    : card.easiness < 2.5
                    ? 'Médio'
                    : 'Fácil';
            return `
            <div class="flashcard-preview">
                <div class="flashcard-meta">
                    <span class="source">${cardSource}</span>
                    <span class="difficulty ${difficulty.toLowerCase()}">${difficulty}</span>
                </div>
                <p class="question-preview">${card.question.substring(
                    0,
                    80
                )}...</p>
                <button class="review-single-btn" data-card-id="${
                    card.id
                }">Revisar</button>
            </div>
        `;
        })
        .join('');

    // Re-add event listeners for new buttons
    document.querySelectorAll('.review-single-btn').forEach((button) => {
        button.addEventListener('click', (e) => {
            const cardId = e.target.dataset.cardId;
            const card = lexiaFlashcards.find((c) => c.id === cardId);
            if (card) {
                startFlashcardReview([card], 'single');
            }
        });
    });
}

// SUBSTITUA A FUNÇÃO 'startFlashcardReview' INTEIRA POR ESTA:

function startFlashcardReview(cardsToReview, reviewType = 'single') {
    if (!cardsToReview || cardsToReview.length === 0) {
        showToast('Nenhum flashcard selecionado para revisar.', 3000);
        if (reviewType !== 'single') renderFlashcards();
        return;
    }

    let currentCardIndex = 0;
    let isFlipped = false;

    const overlay = document.createElement('div');
    overlay.id = 'individual-review-overlay';
    overlay.className =
        'modal-overlay deck-review-modal individual-review-modal';

    function renderReviewCard(index) {
        if (index >= cardsToReview.length) {
            closeReview(true); // Revisão concluída
            return;
        }

        const card = cardsToReview[index];
        isFlipped = false;

        const cardRef = card.articleReference || `Flashcard ${index + 1}`;
        const sourceText = card.sourceTrack || 'Geral';
        const currentDifficulty = card.difficultyLevel || 'unrated'; // Pega a dificuldade atual

        overlay.innerHTML = `
            <div class="deck-review-container"> 
                <div class="deck-header">
                    <h3>${getReviewTypeLabel(reviewType)}</h3>
                    <span class="card-counter">${index + 1} / ${
            cardsToReview.length
        }</span>
                    <button class="btn-icon close-deck-btn" title="Fechar Revisão">✖</button>
                </div>

                <div class="deck-card ${
                    isFlipped ? 'is-flipped' : ''
                }" id="deck-card-current">
                    
                    <div class="card-face card-face--front">
                        <div class="card-content">
                            <small class="card-ref">${cardRef} <span class="difficulty-indicator difficulty-${currentDifficulty}">${getDifficultyLabel(
            currentDifficulty
        )}</span></small>
                            <h4>Pergunta:</h4>
                            <p>${card.question}</p>
                            <small class="card-source-deck">Fonte: ${sourceText}</small>
                        </div>
                        <button class="btn btn-primary flip-deck-card-btn">Mostrar Resposta</button>
                    </div>

                    <div class="card-face card-face--back">
                        <div class="card-content">
                            <small class="card-ref">${cardRef} <span class="difficulty-indicator difficulty-${currentDifficulty}">${getDifficultyLabel(
            currentDifficulty
        )}</span></small>
                            <h4>Resposta:</h4>
                            <p>${card.answer}</p>
                            <small class="card-source-deck">Fonte: ${sourceText}</small>
                        </div>
                        <div class="difficulty-rating-buttons">
                            <p>Como você classificaria este card?</p>
                            <button class="btn btn-difficulty btn-easy" data-difficulty="easy">Fácil</button>
                            <button class="btn btn-difficulty btn-medium" data-difficulty="medium">Médio</button>
                            <button class="btn btn-difficulty btn-difficult" data-difficulty="difficult">Difícil</button>
                        </div>
                        </div>
                </div>

                 ${
                     cardsToReview.length > 1
                         ? `
                 <div class="deck-navigation">
                     <button class="btn btn-secondary prev-card-btn" ${
                         index === 0 ? 'disabled' : ''
                     }>← Anterior</button>
                     <span class="quality-info">(Use os botões de classificação acima)</span>
                     <button class="btn btn-secondary next-card-btn" ${
                         index === cardsToReview.length - 1 ? 'disabled' : ''
                     }>Próxima →</button>
                 </div>
                 `
                         : ''
                 }
            </div>
        `;

        // Event Listeners
        overlay
            .querySelector('.close-deck-btn')
            .addEventListener('click', () => closeReview(false));
        overlay
            .querySelector('.flip-deck-card-btn')
            .addEventListener('click', () => flipCard(true));

        // Listeners para os botões de dificuldade
        overlay
            .querySelectorAll('.difficulty-rating-buttons button')
            .forEach((button) => {
                button.addEventListener('click', (e) => {
                    const difficulty = e.target.dataset.difficulty;
                    rateCard(card.id, difficulty); // Salva a dificuldade
                    showNextCard(); // Avança ou fecha
                });
            });

        // Listeners de navegação (se existirem)
        const prevBtn = overlay.querySelector('.prev-card-btn');
        const nextBtn = overlay.querySelector('.next-card-btn');
        if (prevBtn && !prevBtn.disabled) {
            prevBtn.addEventListener('click', () => {
                if (currentCardIndex > 0) {
                    currentCardIndex--;
                    renderReviewCard(currentCardIndex);
                }
            });
        }
        if (nextBtn && !nextBtn.disabled) {
            nextBtn.addEventListener('click', () => {
                if (currentCardIndex < cardsToReview.length - 1) {
                    currentCardIndex++;
                    renderReviewCard(currentCardIndex);
                }
            });
        }
    }

    function flipCard(showAnswer) {
        const cardElement = overlay.querySelector('#deck-card-current');
        if (showAnswer && !isFlipped) {
            const currentCardData = cardsToReview[currentCardIndex];
            currentCardData.viewCount = (currentCardData.viewCount || 0) + 1;
            // Salva apenas a contagem de visualização ao virar
            const cardIndex = lexiaFlashcards.findIndex(
                (c) => c.id === currentCardData.id
            );
            if (cardIndex !== -1) {
                lexiaFlashcards[cardIndex].viewCount =
                    currentCardData.viewCount;
                saveFlashcards();
            }
            isFlipped = true;
            cardElement.classList.add('is-flipped');
        }
    }

    function rateCard(cardId, difficulty) {
        const cardIndex = lexiaFlashcards.findIndex((c) => c.id === cardId);
        if (cardIndex !== -1) {
            lexiaFlashcards[cardIndex].difficultyLevel = difficulty;
            saveFlashcards(); // Salva a dificuldade escolhida
            console.log(`Card ${cardId} classificado como: ${difficulty}`);
        }
    }

    function showNextCard() {
        currentCardIndex++;
        // Se for o último card (ou revisão individual), fecha. Senão, renderiza o próximo.
        if (currentCardIndex >= cardsToReview.length) {
            closeReview(true);
        } else {
            renderReviewCard(currentCardIndex);
        }
    }

    function closeReview(completed) {
        if (overlay.parentNode) {
            document.body.removeChild(overlay);
        }
        if (completed) {
            showToast(
                `🎉 Você revisou ${cardsToReview.length} flashcard(s)!`,
                3000
            );
        }
        renderFlashcards(); // Sempre atualiza a lista principal ao fechar
    }

    // Função auxiliar para obter label de dificuldade
    function getDifficultyLabel(level) {
        switch (level) {
            case 'easy':
                return 'Fácil';
            case 'medium':
                return 'Médio';
            case 'difficult':
                return 'Difícil';
            default:
                return 'Não Classificado';
        }
    }

    // Inicializa a renderização
    renderReviewCard(currentCardIndex);
    document.body.appendChild(overlay);
}

// --- FUNÇÃO DE NOTIFICAÇÃO (TOAST) --- //
function showToast(message, duration = 3000) {
    // Cria o elemento da notificação
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;

    // Estilos básicos para o toast
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        transform: translateX(150%);
        transition: transform 0.3s ease;
        max-width: 300px;
    `;

    // Adiciona ao corpo da página
    document.body.appendChild(toast);

    // Anima a entrada
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);

    // Agenda a remoção
    setTimeout(() => {
        toast.style.transform = 'translateX(150%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// Modifique a função getReviewTypeLabel

function getReviewTypeLabel(type) {
    const labels = {
        all: 'Revisão Completa (Todas Trilhas Ativas)', // Título mais claro
        allSelectedTracks: 'Revisão Completa (Trilhas Selecionadas)', // Novo título
        filtered: 'Revisão por Dificuldade (Trilhas Selecionadas)', // Título mais claro
        single: 'Revisão Individual',
        // Mantenha os outros tipos se ainda os usar
    };
    return labels[type] || 'Revisão';
}

function updateDashboard() {
    const dashboardSection = document.getElementById('dashboard');
    if (!dashboardSection) {
        console.error(
            'ERRO: Seção #dashboard não encontrada para atualização.'
        );
        return;
    }

    console.log('[Dashboard] Atualizando conteúdo...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtra flashcards ativos (não arquivados) que estão prontos para revisão
    const dueFlashcards = lexiaFlashcards.filter((card) => {
        if (card.isArchived) return false;
        const nextReviewDate = card.nextReview
            ? new Date(card.nextReview)
            : new Date(0);
        nextReviewDate.setHours(0, 0, 0, 0);
        return !card.isArchived && nextReviewDate <= today;
    });

    const todayKey = new Date().toISOString().split('T')[0];
    const todayProgress = lexiaProgress[todayKey] || {
        flashcardsReviewed: 0,
        quizzesCompleted: 0,
        timeStudied: 0,
    };

    const totalActiveFlashcards = lexiaFlashcards.filter(
        (f) => !f.isArchived
    ).length;

    // --- Geração do HTML ---
    dashboardSection.innerHTML = `
        <h2>Dashboard</h2>
        <div class="dashboard-stats">
            <div class="stat-card">
                <h3>⚡ Flashcards para Hoje</h3>
                <p class="stat-number">${dueFlashcards.length}</p>
            </div>
            <div class="stat-card">
                <h3>✅ Flashcards Revisados Hoje</h3>
                <p class="stat-number">${todayProgress.flashcardsReviewed}</p>
            </div>
            <div class="stat-card">
                <h3>📚 Total de Flashcards Ativos</h3>
                <p class="stat-number">${totalActiveFlashcards}</p>
            </div>
            <div class="stat-card">
                <h3>🧠 Quizzes Completados Hoje</h3>
                <p class="stat-number">${todayProgress.quizzesCompleted}</p>
            </div>
        </div>
        <div class="quick-actions">
            <button id="start-review" class="btn btn-primary" ${
                dueFlashcards.length === 0 ? 'disabled' : ''
            }>
                Iniciar Revisão (${dueFlashcards.length} cartões)
            </button>
            <button id="start-quiz" class="btn btn-secondary">
                Fazer Quiz Adaptativo
            </button>
        </div>
    `;

    // --- CORREÇÃO: Adicionar listeners usando o próprio dashboardSection como delegador ---
    dashboardSection.addEventListener('click', function (e) {
        const target = e.target;

        // Botão "Iniciar Revisão"
        if (target.id === 'start-review' || target.closest('#start-review')) {
            console.log('[Dashboard] Botão Iniciar Revisão clicado.');
            e.preventDefault();

            if (!target.disabled && dueFlashcards.length > 0) {
                document.querySelectorAll('main section').forEach((section) => {
                    section.classList.remove('active-section');
                });
                const flashcardsSection = document.getElementById('flashcards');
                if (flashcardsSection) {
                    flashcardsSection.classList.add('active-section');
                    // Atualizar navegação ativa
                    document
                        .querySelectorAll('#sidebar nav ul li a')
                        .forEach((link) => link.classList.remove('active'));
                    const flashcardsLink = document.querySelector(
                        '#sidebar nav ul li a[href="#flashcards"]'
                    );
                    if (flashcardsLink) flashcardsLink.classList.add('active');
                    renderFlashcards();
                }
            }
            return;
        }

        // Botão "Fazer Quiz Adaptativo"
        if (target.id === 'start-quiz' || target.closest('#start-quiz')) {
            console.log('[Dashboard] Botão Fazer Quiz clicado.');
            e.preventDefault();

            document.querySelectorAll('main section').forEach((section) => {
                section.classList.remove('active-section');
            });
            const quizSection = document.getElementById('quiz');
            if (quizSection) {
                quizSection.classList.add('active-section');
                // Atualizar navegação ativa
                document
                    .querySelectorAll('#sidebar nav ul li a')
                    .forEach((link) => link.classList.remove('active'));
                const quizLink = document.querySelector(
                    '#sidebar nav ul li a[href="#quiz"]'
                );
                if (quizLink) quizLink.classList.add('active');
                renderQuiz();
            }
            return;
        }
    });
}

// --- Quiz System --- //
class QuizManager {
    constructor() {
        this.currentQuiz = null;
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.userAnswers = [];
        this.quizHistory =
            JSON.parse(localStorage.getItem('lexia_quiz_history')) || [];
        this.questionBank =
            JSON.parse(localStorage.getItem('lexia_question_bank')) || [];
    }

    saveQuizData() {
        localStorage.setItem(
            'lexia_quiz_history',
            JSON.stringify(this.quizHistory)
        );
        localStorage.setItem(
            'lexia_question_bank',
            JSON.stringify(this.questionBank)
        );
        console.log('Dados do quiz salvos:', {
            history: this.quizHistory.length,
            questionBank: this.questionBank.length,
        });
    }

    startQuizFromBank() {
        if (this.questionBank.length === 0) {
            alert(
                'Nenhuma questão disponível no banco. Gere questões a partir de artigos de lei primeiro.'
            );
            return null;
        }

        // Shuffle questions and select up to 10
        const shuffledQuestions = [...this.questionBank].sort(
            () => Math.random() - 0.5
        );
        const selectedQuestions = shuffledQuestions.slice(
            0,
            Math.min(10, shuffledQuestions.length)
        );

        this.currentQuiz = {
            id: Date.now(),
            questions: selectedQuestions,
            config: { fromBank: true },
            startTime: new Date(),
            endTime: null,
            score: 0,
        };

        this.currentQuestionIndex = 0;
        this.userAnswers = [];
        this.questionStartTime = Date.now();

        return this.currentQuiz;
    }

    async generateQuiz(config) {
        if (lexiaChunks.length === 0) {
            alert(
                'Nenhum conteúdo disponível para gerar quiz. Carregue os PDFs primeiro.'
            );
            return null;
        }

        // Check if using specific articles
        if (
            config.useSpecificArticles &&
            config.selectedArticles &&
            config.selectedArticles.length > 0
        ) {
            return await this.generateQuizFromSpecificArticles(config);
        }

        // Filter chunks based on source if specified
        let availableChunks = lexiaChunks;
        if (config.sourceFilter && config.sourceFilter !== 'all') {
            availableChunks = lexiaChunks.filter(
                (chunk) => chunk.file === config.sourceFilter
            );
        }

        if (availableChunks.length === 0) {
            alert('Nenhum conteúdo disponível para a fonte selecionada.');
            return null;
        }

        const shuffledChunks = [...availableChunks].sort(
            () => Math.random() - 0.5
        );
        const selectedChunks = shuffledChunks.slice(0, config.numQuestions);
        const questions = [];

        for (let i = 0; i < selectedChunks.length; i++) {
            const chunk = selectedChunks[i];
            const question = await this.generateAdvancedQuestion(
                chunk,
                i,
                config
            );
            questions.push(question);
        }

        this.currentQuiz = {
            id: Date.now(),
            questions: questions,
            config: config,
            startTime: new Date(),
            endTime: null,
            score: 0,
        };

        return this.currentQuiz;
    }

    async generateQuizFromSpecificArticles(config) {
        const selectedArticles = config.selectedArticles;
        const questions = [];

        // Calculate how many questions per article
        const questionsPerArticle = Math.max(
            1,
            Math.floor(config.numQuestions / selectedArticles.length)
        );
        const remainingQuestions =
            config.numQuestions - questionsPerArticle * selectedArticles.length;

        let questionIndex = 0;

        for (let i = 0; i < selectedArticles.length; i++) {
            const article = selectedArticles[i];
            const questionsForThisArticle =
                questionsPerArticle + (i < remainingQuestions ? 1 : 0);

            for (let j = 0; j < questionsForThisArticle; j++) {
                try {
                    const question = await this.generateQuestionFromArticle(
                        article,
                        questionIndex,
                        config,
                        j + 1
                    );
                    if (question) {
                        questions.push(question);
                        questionIndex++;
                    }
                } catch (error) {
                    console.error(
                        `Erro ao gerar questão para ${article.fullReference}:`,
                        error
                    );
                    // Fallback question
                    questions.push(
                        this.generateFallbackQuestionFromArticle(
                            article,
                            questionIndex,
                            config
                        )
                    );
                    questionIndex++;
                }

                // Add delay to prevent rate limiting
                if (j < questionsForThisArticle - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            // Add delay between articles
            if (i < selectedArticles.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }

        // Shuffle questions to mix articles
        const shuffledQuestions = questions.sort(() => Math.random() - 0.5);

        this.currentQuiz = {
            id: Date.now(),
            questions: shuffledQuestions,
            config: config,
            startTime: new Date(),
            endTime: null,
            score: 0,
            fromSpecificArticles: true,
            selectedArticles: selectedArticles.map((a) => a.fullReference),
        };

        this.currentQuestionIndex = 0;
        this.score = 0;
        this.userAnswers = [];
        this.questionStartTime = Date.now();

        return this.currentQuiz;
    }

    // SUBSTITUA A SUA FUNÇÃO 'generateQuestionFromArticle' POR ESTA:
    async generateQuestionFromArticle(article, index, config, questionNumber) {
        const focusPrompts = {
            general: 'questões gerais sobre o conteúdo do artigo',
            laws: 'questões específicas sobre a aplicação e interpretação do artigo',
            concepts: 'questões focadas em conceitos e definições do artigo',
            procedures: 'questões sobre procedimentos descritos no artigo',
            jurisprudence:
                'questões sobre interpretações jurisprudenciais do artigo',
        };

        const typeInstructions = {
            'multiple-choice': `múltipla escolha com ${config.numOptions} alternativas`,
            'true-false': 'verdadeiro ou falso',
            essay: 'dissertativa (resposta em texto)',
            mixed: 'formato variado',
        };

        const prompt = `
Crie uma questão de ${
            typeInstructions[config.questionType]
        } baseada no seguinte artigo de lei:

**Artigo:** ${article.fullReference}
**Lei:** ${article.law}
**Assunto:** ${article.subject}
**Texto:** ${article.fullText || 'Texto não disponível'}
**Contexto:** ${article.context || ''}

**Configurações:**
- Dificuldade: ${config.difficulty}
- Foco: ${focusPrompts[config.contentFocus]}
- Questão número: ${questionNumber} (varie o tipo e dificuldade)
- ${config.includeTricks ? 'INCLUIR pegadinhas e armadilhas' : 'SEM pegadinhas'}
- ${
            config.contextual
                ? 'Questão contextualizada com situação prática'
                : 'Questão direta'
        }

FORMATO DE RESPOSTA:
${
    config.questionType === 'multiple-choice'
        ? `PERGUNTA: [sua pergunta]
A) [alternativa A]
B) [alternativa B]
C) [alternativa C]
${config.numOptions >= 4 ? 'D) [alternativa D]' : ''}
${config.numOptions >= 5 ? 'E) [alternativa E]' : ''}
RESPOSTA_CORRETA: [letra da alternativa correta]
EXPLICACAO: [explicação detalhada]`
        : config.questionType === 'true-false'
        ? `PERGUNTA: [sua pergunta]
RESPOSTA_CORRETA: [VERDADEIRO ou FALSO]
EXPLICACAO: [explicação detalhada]`
        : `PERGUNTA: [sua pergunta dissertativa]
RESPOSTA_ESPERADA: [pontos principais que devem ser abordados]
EXPLICACAO: [critérios de avaliação]`
}

Crie uma questão relevante e educativa sobre este artigo específico:`;

        const response = await callGemini(prompt);
        if (response) {
            // <-- CORREÇÃO: Passamos o objeto 'article' inteiro para o parser
            return this.parseQuestionResponse(response, article, index, config);
        }

        return null;
    }

    generateFallbackQuestionFromArticle(article, index, config) {
        const options = [
            `Segundo o ${article.fullReference}`,
            'Conforme a legislação vigente',
            'De acordo com a jurisprudência',
            'Segundo a doutrina majoritária',
        ];

        return {
            id: `fallback-q${index}`,
            type: 'multiple-choice',
            question: `Qual é o tema principal do ${article.fullReference}?`,
            options: options,
            correctAnswer: 0,
            explanation: `O ${article.fullReference} trata de: ${article.subject}`,
            articleReference: article.fullReference,
            difficulty: config.difficulty,
        };
    }

    async generateAdvancedQuestion(chunk, index, config) {
        const prompt = this.buildQuestionPrompt(chunk, config);

        try {
            const response = await callGemini(prompt);
            if (response) {
                return this.parseQuestionResponse(
                    response,
                    chunk,
                    index,
                    config
                );
            }
        } catch (error) {
            console.error('Erro ao gerar questão com IA:', error);
        }

        // Fallback to basic question generation
        return this.generateQuestionFromChunk(chunk, index, config.difficulty);
    }

    buildQuestionPrompt(chunk, config) {
        const focusInstructions = {
            general: 'questões gerais sobre o conteúdo',
            laws: 'questões específicas sobre leis, artigos e normas',
            concepts: 'questões focadas em conceitos e definições jurídicas',
            procedures: 'questões sobre procedimentos e trâmites',
            jurisprudence: 'questões sobre jurisprudência e interpretações',
        };

        const typeInstructions = {
            'multiple-choice': `múltipla escolha com ${config.numOptions} alternativas`,
            'true-false': 'verdadeiro ou falso',
            essay: 'dissertativa (resposta em texto)',
            mixed: 'formato variado',
        };

        return `
Baseado no seguinte texto jurídico, crie uma questão de ${
            typeInstructions[config.questionType]
        } com foco em ${focusInstructions[config.contentFocus]}.

TEXTO:
${chunk.text}

CONFIGURAÇÕES:
- Dificuldade: ${config.difficulty}
- ${config.includeTricks ? 'INCLUIR pegadinhas e armadilhas' : 'SEM pegadinhas'}
- ${
            config.contextual
                ? 'Questão contextualizada com situação prática'
                : 'Questão direta'
        }

FORMATO DE RESPOSTA:
${
    config.questionType === 'multiple-choice'
        ? `PERGUNTA: [sua pergunta]
A) [alternativa A]
B) [alternativa B]
C) [alternativa C]
${config.numOptions >= 4 ? 'D) [alternativa D]' : ''}
${config.numOptions >= 5 ? 'E) [alternativa E]' : ''}
RESPOSTA_CORRETA: [letra da alternativa correta]
EXPLICACAO: [explicação detalhada]`
        : config.questionType === 'true-false'
        ? `PERGUNTA: [sua pergunta]
RESPOSTA_CORRETA: [VERDADEIRO ou FALSO]
EXPLICACAO: [explicação detalhada]`
        : `PERGUNTA: [sua pergunta dissertativa]
RESPOSTA_ESPERADA: [pontos principais que devem ser abordados]
EXPLICACAO: [critérios de avaliação]`
}

Crie uma questão relevante e educativa:`;
    }

    // SUBSTITUA A SUA FUNÇÃO 'parseQuestionResponse' POR ESTA:
    parseQuestionResponse(response, sourceObject, index, config) {
        const lines = response.split('\n').filter((line) => line.trim());

        // <-- CORREÇÃO: Variáveis para armazenar os dados específicos da fonte
        const isFromArticle = !!sourceObject.fullReference;
        const chunkId = isFromArticle ? sourceObject.chunkId : sourceObject.id;
        const articleId = isFromArticle ? sourceObject.id : null;
        const articleReference = isFromArticle
            ? sourceObject.fullReference
            : null;

        if (config.questionType === 'multiple-choice') {
            const questionText = lines
                .find((line) => line.startsWith('PERGUNTA:'))
                ?.replace('PERGUNTA:', '')
                .trim();
            const options = lines
                .filter((line) => /^[A-E]\)/.test(line))
                .map((line) => line.substring(3).trim());
            const correctLetter = lines
                .find((line) => line.startsWith('RESPOSTA_CORRETA:'))
                ?.replace('RESPOSTA_CORRETA:', '')
                .trim();
            const explanation = lines
                .find((line) => line.startsWith('EXPLICACAO:'))
                ?.replace('EXPLICACAO:', '')
                .trim();

            const correctIndex = correctLetter
                ? correctLetter.charCodeAt(0) - 65
                : 0;

            return {
                id: `q${index}`,
                type: 'multiple-choice',
                question:
                    questionText ||
                    `Questão sobre ${sourceObject.file || sourceObject.law}`,
                options:
                    options.length >= config.numOptions
                        ? options
                        : this.generateFallbackOptions(config.numOptions),
                correctAnswer: Math.min(correctIndex, options.length - 1),
                explanation: explanation || 'Baseado no conteúdo do material.',
                chunkId: chunkId,
                difficulty: config.difficulty,
                articleId: articleId, // <-- CORREÇÃO: Adicionando o ID do artigo
                articleReference: articleReference, // <-- CORREÇÃO: Adicionando a referência
            };
        }

        // Fallback
        return this.generateQuestionFromChunk(chunk, index, config.difficulty);
    }

    generateFallbackOptions(numOptions) {
        const options = ['Opção A', 'Opção B', 'Opção C'];
        if (numOptions >= 4) options.push('Opção D');
        if (numOptions >= 5) options.push('Opção E');
        return options;
    }

    generateQuestionFromChunk(chunk, index, difficulty) {
        const text = chunk.text;
        const sentences = text.split('.').filter((s) => s.trim().length > 20);

        if (sentences.length === 0) {
            return {
                id: `q${index}`,
                question: `Qual é o tema principal da página ${chunk.page} do arquivo ${chunk.file}?`,
                options: [
                    'Direitos fundamentais',
                    'Procedimentos administrativos',
                    'Normas constitucionais',
                    'Legislação específica',
                ],
                correctAnswer: 0,
                explanation: `Baseado no conteúdo da página ${chunk.page} do arquivo ${chunk.file}.`,
                chunkId: chunk.id,
                difficulty: difficulty,
            };
        }

        const randomSentence =
            sentences[Math.floor(Math.random() * sentences.length)].trim();
        const words = randomSentence.split(' ').filter((w) => w.length > 3);

        if (words.length > 0) {
            const keyWord = words[Math.floor(Math.random() * words.length)];
            const question = `Complete a frase: "${randomSentence.replace(
                keyWord,
                '______'
            )}"`;

            const correctAnswer = keyWord;
            const wrongOptions = this.generateWrongOptions(
                correctAnswer,
                chunk.file
            );
            const allOptions = [correctAnswer, ...wrongOptions].sort(
                () => Math.random() - 0.5
            );
            const correctIndex = allOptions.indexOf(correctAnswer);

            return {
                id: `q${index}`,
                question: question,
                options: allOptions,
                correctAnswer: correctIndex,
                explanation: `A resposta correta é "${correctAnswer}" conforme o conteúdo da página ${chunk.page} do arquivo ${chunk.file}.`,
                chunkId: chunk.id,
                difficulty: difficulty,
            };
        }

        return {
            id: `q${index}`,
            question: `Qual conceito está relacionado ao conteúdo da página ${chunk.page} do arquivo ${chunk.file}?`,
            options: [
                'Princípios gerais',
                'Normas específicas',
                'Procedimentos',
                'Jurisprudência',
            ],
            correctAnswer: 0,
            explanation: `Baseado no conteúdo da página ${chunk.page} do arquivo ${chunk.file}.`,
            chunkId: chunk.id,
            difficulty: difficulty,
        };
    }

    generateWrongOptions(correctAnswer, fileName) {
        const commonLegalTerms = [
            'constitucional',
            'administrativo',
            'penal',
            'civil',
            'processual',
            'direito',
            'lei',
            'norma',
            'artigo',
            'princípio',
            'procedimento',
            'competência',
            'jurisdição',
            'recurso',
            'sentença',
            'decisão',
            'processo',
            'ação',
            'defesa',
            'prova',
            'julgamento',
        ];

        const wrongOptions = [];
        const usedOptions = new Set([correctAnswer.toLowerCase()]);

        while (wrongOptions.length < 3 && commonLegalTerms.length > 0) {
            const randomTerm =
                commonLegalTerms[
                    Math.floor(Math.random() * commonLegalTerms.length)
                ];
            if (!usedOptions.has(randomTerm.toLowerCase())) {
                wrongOptions.push(randomTerm);
                usedOptions.add(randomTerm.toLowerCase());
            }
        }

        while (wrongOptions.length < 3) {
            wrongOptions.push(`Opção ${wrongOptions.length + 1}`);
        }

        return wrongOptions;
    }

    // app.js - Dentro da classe QuizManager

    submitAnswer(questionIndex, selectedOption) {
        if (
            !this.currentQuiz ||
            questionIndex >= this.currentQuiz.questions.length
        ) {
            return false;
        }

        const question = this.currentQuiz.questions[questionIndex];
        const isCorrect = selectedOption === question.correctAnswer;

        // --- INÍCIO DA CORREÇÃO CRÍTICA ---
        // Verifica se a questão veio de um artigo e atualiza as estatísticas
        if (question.articleId) {
            console.log(
                `[DEBUG] Atualizando estatísticas para o artigo ID: ${question.articleId}, Acerto: ${isCorrect}`
            );
            updateArticleUsage(question.articleId, isCorrect);
        }
        // --- FIM DA CORREÇÃO CRÍTICA ---

        this.userAnswers[questionIndex] = {
            questionId: question.id,
            selectedOption: selectedOption,
            isCorrect: isCorrect,
            timeSpent: Date.now() - (this.questionStartTime || Date.now()),
        };

        if (isCorrect) {
            this.score++;
        }

        return isCorrect;
    }

    finishQuiz() {
        if (!this.currentQuiz) return null;

        this.currentQuiz.endTime = new Date();
        this.currentQuiz.score = this.score;
        this.currentQuiz.userAnswers = this.userAnswers;
        this.currentQuiz.percentage = Math.round(
            (this.score / this.currentQuiz.questions.length) * 100
        );

        this.quizHistory.push(this.currentQuiz);
        localStorage.setItem(
            'lexia_quiz_history',
            JSON.stringify(this.quizHistory)
        );

        const today = new Date().toISOString().split('T')[0];
        if (!lexiaProgress[today]) {
            lexiaProgress[today] = {
                flashcardsReviewed: 0,
                quizzesCompleted: 0,
                timeStudied: 0,
            };
        }
        lexiaProgress[today].quizzesCompleted++;
        localStorage.setItem('lexia_progress', JSON.stringify(lexiaProgress));

        const result = { ...this.currentQuiz };
        this.resetQuiz();
        return result;
    }

    resetQuiz() {
        this.currentQuiz = null;
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.userAnswers = [];
        this.questionStartTime = null;
    }

    getAverageDifficulty() {
        if (this.quizHistory.length === 0) return 'medium';

        const recentQuizzes = this.quizHistory.slice(-5);
        const averageScore =
            recentQuizzes.reduce((sum, quiz) => sum + quiz.percentage, 0) /
            recentQuizzes.length;

        if (averageScore >= 80) return 'hard';
        if (averageScore >= 60) return 'medium';
        return 'easy';
    }
}

// Adicione esta função antes da função renderQuiz()

function renderAvailableArticles() {
    const allArticles = [];

    // Coletar todos os artigos de todas as trilhas
    lexiaChunks.forEach((chunk) => {
        if (chunk.legalArticles && chunk.legalArticles.length > 0) {
            chunk.legalArticles.forEach((article) => {
                allArticles.push({
                    ...article,
                    chunkId: chunk.id,
                    fileName: chunk.file,
                });
            });
        }
    });

    if (allArticles.length === 0) {
        return '<p class="no-articles">Nenhum artigo de lei disponível. Processe PDFs primeiro.</p>';
    }

    // Agrupar por lei/arquivo
    const articlesByLaw = {};
    allArticles.forEach((article) => {
        const lawName = article.law || article.fileName;
        if (!articlesByLaw[lawName]) {
            articlesByLaw[lawName] = [];
        }
        articlesByLaw[lawName].push(article);
    });

    return Object.entries(articlesByLaw)
        .map(
            ([lawName, articles]) => `
            <div class="law-articles-group">
                <div class="law-header">
                    <h5>${lawName}</h5>
                    <span class="article-count">${
                        articles.length
                    } artigos</span>
                </div>
                <div class="articles-checkbox-list">
                    ${articles
                        .map(
                            (article) => `
                        <div class="article-checkbox-item">
                            <label>
                                <input type="checkbox" 
                                       class="article-selection-checkbox" 
                                       value="${article.id}"
                                       data-article-id="${article.id}">
                                <span class="checkmark"></span>
                                <div class="article-info">
                                    <strong class="article-reference">${
                                        article.fullReference
                                    }</strong>
                                    <p class="article-subject">${
                                        article.subject
                                    }</p>
                                    <span class="article-stats">
                                        ${
                                            getArticleStats(article.id)
                                                .usedInQuestions > 0
                                                ? `🎯 ${
                                                      getArticleStats(
                                                          article.id
                                                      ).usedInQuestions
                                                  } uso(s)`
                                                : '📝 Nunca utilizado'
                                        }
                                    </span>
                                </div>
                            </label>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            </div>
        `
        )
        .join('');
}

// Também adicione esta função auxiliar para configurar os event listeners
function setupArticleSelectionListeners() {
    const useSpecificArticles = document.getElementById(
        'use-specific-articles'
    );
    const articlesSelection = document.getElementById('articles-selection');
    const articlesSearch = document.getElementById('articles-search');
    const selectAllBtn = document.getElementById('select-all-articles');
    const clearBtn = document.getElementById('clear-articles');
    const selectedCount = document.getElementById('selected-articles-count');

    if (useSpecificArticles && articlesSelection) {
        useSpecificArticles.addEventListener('change', function () {
            articlesSelection.style.display = this.checked ? 'block' : 'none';
            updateSelectedArticlesCount();
        });
    }

    if (articlesSearch) {
        articlesSearch.addEventListener('input', function () {
            const searchTerm = this.value.toLowerCase();
            const articles = document.querySelectorAll(
                '.article-checkbox-item'
            );

            articles.forEach((article) => {
                const articleText = article.textContent.toLowerCase();
                article.style.display = articleText.includes(searchTerm)
                    ? 'block'
                    : 'none';
            });
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', function () {
            document
                .querySelectorAll('.article-selection-checkbox')
                .forEach((checkbox) => {
                    checkbox.checked = true;
                });
            updateSelectedArticlesCount();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            document
                .querySelectorAll('.article-selection-checkbox')
                .forEach((checkbox) => {
                    checkbox.checked = false;
                });
            updateSelectedArticlesCount();
        });
    }

    // Atualizar contagem quando checkboxes são alterados
    document.addEventListener('change', function (e) {
        if (e.target.classList.contains('article-selection-checkbox')) {
            updateSelectedArticlesCount();
        }
    });
}

function updateSelectedArticlesCount() {
    const selectedCount = document.getElementById('selected-articles-count');
    if (selectedCount) {
        const selected = document.querySelectorAll(
            '.article-selection-checkbox:checked'
        ).length;
        selectedCount.textContent = `${selected} artigos selecionados`;
    }
}

function getSelectedArticles() {
    const selectedCheckboxes = document.querySelectorAll(
        '.article-selection-checkbox:checked'
    );
    const allArticles = [];

    // Coletar todos os artigos
    lexiaChunks.forEach((chunk) => {
        if (chunk.legalArticles && chunk.legalArticles.length > 0) {
            chunk.legalArticles.forEach((article) => {
                allArticles.push({
                    ...article,
                    chunkId: chunk.id,
                    fileName: chunk.file,
                });
            });
        }
    });

    return Array.from(selectedCheckboxes)
        .map((checkbox) => {
            return allArticles.find((article) => article.id === checkbox.value);
        })
        .filter(Boolean);
}

const quizManager = new QuizManager();

function renderQuiz() {
    const quizArea = document.getElementById('quiz-area');

    if (!quizManager.currentQuiz) {
        const suggestedDifficulty = quizManager.getAverageDifficulty();
        quizArea.innerHTML = `
            <div class="quiz-start">
                <h3>Configurar Novo Quiz</h3>
                <p>Personalize seu quiz com opções avançadas para um estudo mais eficaz.</p>
                
                <div class="quiz-config">
                    <div class="config-section">
                        <h4>Configurações Básicas</h4>
                        <div class="config-row">
                            <label for="quiz-difficulty">Dificuldade:</label>
                            <select id="quiz-difficulty">
                                <option value="easy" ${
                                    suggestedDifficulty === 'easy'
                                        ? 'selected'
                                        : ''
                                }>Fácil</option>
                                <option value="medium" ${
                                    suggestedDifficulty === 'medium'
                                        ? 'selected'
                                        : ''
                                }>Médio</option>
                                <option value="hard" ${
                                    suggestedDifficulty === 'hard'
                                        ? 'selected'
                                        : ''
                                }>Difícil</option>
                                <option value="adaptive">Adaptativo</option>
                            </select>
                        </div>
                        <div class="config-row">
                            <label for="quiz-questions">Número de perguntas:</label>
                            <select id="quiz-questions">
                                <option value="5">5 perguntas</option>
                                <option value="10" selected>10 perguntas</option>
                                <option value="15">15 perguntas</option>
                                <option value="20">20 perguntas</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="config-section">
                        <h4>Tipo de Questões</h4>
                        <div class="config-row">
                            <label for="question-type">Formato:</label>
                            <select id="question-type">
                                <option value="multiple-choice">Múltipla Escolha</option>
                                <option value="true-false">Verdadeiro ou Falso</option>
                                <option value="essay">Dissertativa</option>
                                <option value="mixed">Misto</option>
                            </select>
                        </div>
                        <div class="config-row">
                            <label for="num-options">Alternativas (múltipla escolha):</label>
                            <select id="num-options">
                                <option value="3">3 alternativas</option>
                                <option value="4" selected>4 alternativas</option>
                                <option value="5">5 alternativas</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="config-section">
                        <h4>Abordagem do Conteúdo</h4>
                        <div class="config-row">
                            <label for="content-focus">Foco:</label>
                            <select id="content-focus">
                                <option value="general">Geral</option>
                                <option value="laws">Específico - Leis</option>
                                <option value="concepts">Específico - Conceitos</option>
                                <option value="procedures">Específico - Procedimentos</option>
                                <option value="jurisprudence">Específico - Jurisprudência</option>
                            </select>
                        </div>
                        <div class="config-row">
                            <label for="source-filter">Filtrar por fonte:</label>
                            <select id="source-filter">
                                <option value="all">Todas as fontes</option>
                                ${getUniqueChunkSources()
                                    .map(
                                        (source) =>
                                            `<option value="${source}">${source}</option>`
                                    )
                                    .join('')}
                            </select>
                        </div>
                    </div>
                    
                    <div class="config-section">
                        <h4>⚖️ Seleção de Artigos de Lei</h4>
                        <div class="config-row">
                            <label>
                                <input type="checkbox" id="use-specific-articles">
                                Gerar questões baseadas em artigos específicos
                            </label>
                        </div>
                        <div id="articles-selection" class="articles-selection" style="display: none;">
                            <div class="articles-filter">
                                <input type="text" id="articles-search" placeholder="Buscar artigos (ex: Art. 312, CP, etc.)">
                                <div class="articles-actions">
                                    <button type="button" id="select-all-articles" class="btn-small">Selecionar Todos</button>
                                    <button type="button" id="clear-articles" class="btn-small">Limpar Seleção</button>
                                </div>
                            </div>
                            <div id="articles-list" class="articles-list">
                                ${renderAvailableArticles()}
                            </div>
                            <div class="selected-articles-summary">
                                <span id="selected-articles-count">0 artigos selecionados</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="config-section">
                        <h4>Opções Avançadas</h4>
                        <div class="config-checkbox">
                            <input type="checkbox" id="include-tricks" checked>
                            <label for="include-tricks">Incluir pegadinhas</label>
                        </div>
                        <div class="config-checkbox">
                            <input type="checkbox" id="contextual-questions" checked>
                            <label for="contextual-questions">Questões contextualizadas</label>
                        </div>
                        <div class="config-checkbox">
                            <input type="checkbox" id="time-limit">
                            <label for="time-limit">Limite de tempo (30 seg/questão)</label>
                        </div>
                        <div class="config-checkbox">
                            <input type="checkbox" id="review-wrong" checked>
                            <label for="review-wrong">Revisar questões erradas ao final</label>
                        </div>
                    </div>
                </div>
                
                <div class="quiz-actions">
                    <button id="start-quiz-btn" class="btn-primary">Iniciar Quiz</button>
                    <button id="quick-quiz-btn" class="btn-secondary">Quiz Rápido (5 questões)</button>
                </div>
                
                <div class="quiz-history">
                    <h4>Histórico Recente</h4>
                    ${renderQuizHistory()}
                </div>
                
                <div class="quiz-stats">
                    <h4>Estatísticas</h4>
                    ${renderQuizStats()}
                </div>
                
                ${
                    quizManager.questionBank.length > 0
                        ? `
                <div class="question-bank">
                    <h4>Banco de Questões (${quizManager.questionBank.length})</h4>
                    <p>Questões geradas a partir de artigos de lei específicos.</p>
                    <button id="use-question-bank" class="btn-secondary">Usar Questões do Banco</button>
                </div>
                `
                        : ''
                }
            </div>
        `;

        document
            .getElementById('start-quiz-btn')
            .addEventListener('click', async () => {
                const config = getQuizConfig();
                const quiz = await quizManager.generateQuiz(config);
                if (quiz) {
                    quizManager.questionStartTime = Date.now();
                    renderCurrentQuestion();
                }
            });

        document
            .getElementById('quick-quiz-btn')
            .addEventListener('click', async () => {
                const quickConfig = {
                    difficulty: 'medium',
                    numQuestions: 5,
                    questionType: 'multiple-choice',
                    numOptions: 4,
                    contentFocus: 'general',
                    sourceFilter: 'all',
                    includeTricks: false,
                    contextual: true,
                    timeLimit: false,
                    reviewWrong: true,
                };
                const quiz = await quizManager.generateQuiz(quickConfig);
                if (quiz) {
                    quizManager.questionStartTime = Date.now();
                    renderCurrentQuestion();
                }
            });

        // Add event listener for question bank button if it exists
        const questionBankBtn = document.getElementById('use-question-bank');
        if (questionBankBtn) {
            questionBankBtn.addEventListener('click', () => {
                quizManager.startQuizFromBank();
                renderCurrentQuestion();
            });
        }

        // Add event listeners for article selection functionality
        setupArticleSelectionListeners();
    } else {
        renderCurrentQuestion();
    }
}

function getQuizConfig() {
    const useSpecificArticles = document.getElementById(
        'use-specific-articles'
    ).checked;
    const selectedArticles = useSpecificArticles ? getSelectedArticles() : [];

    return {
        difficulty: document.getElementById('quiz-difficulty').value,
        numQuestions: parseInt(document.getElementById('quiz-questions').value),
        questionType: document.getElementById('question-type').value,
        numOptions: parseInt(document.getElementById('num-options').value),
        contentFocus: document.getElementById('content-focus').value,
        sourceFilter: document.getElementById('source-filter').value,
        includeTricks: document.getElementById('include-tricks').checked,
        contextual: document.getElementById('contextual-questions').checked,
        timeLimit: document.getElementById('time-limit').checked,
        reviewWrong: document.getElementById('review-wrong').checked,
        useSpecificArticles: useSpecificArticles,
        selectedArticles: selectedArticles,
    };
}

function getUniqueChunkSources() {
    const sources = new Set();
    lexiaChunks.forEach((chunk) => {
        sources.add(chunk.file);
    });
    return Array.from(sources);
}

function renderQuizStats() {
    const totalQuizzes = quizManager.quizHistory.length;
    if (totalQuizzes === 0) {
        return '<p>Nenhum quiz realizado ainda.</p>';
    }

    const averageScore =
        quizManager.quizHistory.reduce(
            (sum, quiz) => sum + quiz.percentage,
            0
        ) / totalQuizzes;
    const bestScore = Math.max(
        ...quizManager.quizHistory.map((quiz) => quiz.percentage)
    );
    const totalQuestions = quizManager.quizHistory.reduce(
        (sum, quiz) => sum + quiz.questions.length,
        0
    );

    return `
        <div class="stats-grid">
            <div class="stat-item">
                <span class="stat-label">Quizzes Realizados:</span>
                <span class="stat-value">${totalQuizzes}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Média Geral:</span>
                <span class="stat-value">${averageScore.toFixed(1)}%</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Melhor Score:</span>
                <span class="stat-value">${bestScore}%</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Total de Questões:</span>
                <span class="stat-value">${totalQuestions}</span>
            </div>
        </div>
    `;
}

function renderCurrentQuestion() {
    const quizArea = document.getElementById('quiz-area');
    const quiz = quizManager.currentQuiz;
    const questionIndex = quizManager.currentQuestionIndex;
    const question = quiz.questions[questionIndex];

    if (questionIndex >= quiz.questions.length) {
        const result = quizManager.finishQuiz();
        renderQuizResults(result);
        return;
    }

    quizArea.innerHTML = `
        <div class="quiz-question">
            <div class="quiz-progress">
                <p>Pergunta ${questionIndex + 1} de ${quiz.questions.length}</p>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${
                        (questionIndex / quiz.questions.length) * 100
                    }%"></div>
                </div>
            </div>
            <h3>${question.question}</h3>
            <ul class="quiz-options">
                ${question.options
                    .map(
                        (option, index) =>
                            `<li data-option="${index}">${option}</li>`
                    )
                    .join('')}
            </ul>
            <div class="quiz-controls">
                <button id="submit-answer" disabled>Responder</button>
                <button id="skip-question">Pular</button>
            </div>
        </div>
    `;

    let selectedOption = null;

    document.querySelectorAll('.quiz-options li').forEach((option) => {
        option.addEventListener('click', () => {
            document
                .querySelectorAll('.quiz-options li')
                .forEach((opt) => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedOption = parseInt(option.dataset.option);
            document.getElementById('submit-answer').disabled = false;
        });
    });

    document.getElementById('submit-answer').addEventListener('click', () => {
        if (selectedOption !== null) {
            const isCorrect = quizManager.submitAnswer(
                questionIndex,
                selectedOption
            );
            showAnswerFeedback(question, selectedOption, isCorrect);
        }
    });

    document.getElementById('skip-question').addEventListener('click', () => {
        quizManager.submitAnswer(questionIndex, -1);
        quizManager.currentQuestionIndex++;
        quizManager.questionStartTime = Date.now();
        renderCurrentQuestion();
    });
}

function showAnswerFeedback(question, selectedOption, isCorrect) {
    const quizArea = document.getElementById('quiz-area');

    document.querySelectorAll('.quiz-options li').forEach((option, index) => {
        if (index === question.correctAnswer) {
            option.classList.add('correct');
        } else if (index === selectedOption && !isCorrect) {
            option.classList.add('incorrect');
        }
    });

    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'answer-feedback';
    feedbackDiv.innerHTML = `
        <p class="${isCorrect ? 'correct-feedback' : 'incorrect-feedback'}">
            ${isCorrect ? '✅ Correto!' : '❌ Incorreto!'}
        </p>
        <p>${question.explanation}</p>
        <button id="next-question">Próxima Pergunta</button>
    `;

    quizArea.appendChild(feedbackDiv);

    document.getElementById('next-question').addEventListener('click', () => {
        quizManager.currentQuestionIndex++;
        quizManager.questionStartTime = Date.now();
        renderCurrentQuestion();
    });
}

function renderQuizResults(result) {
    const quizArea = document.getElementById('quiz-area');
    const percentage = result.percentage;
    const duration = Math.round((result.endTime - result.startTime) / 1000);

    let performanceMessage = '';
    if (percentage >= 90) performanceMessage = 'Excelente! 🏆';
    else if (percentage >= 70) performanceMessage = 'Muito bom! 👏';
    else if (percentage >= 50) performanceMessage = 'Bom trabalho! 👍';
    else performanceMessage = 'Continue estudando! 📚';

    quizArea.innerHTML = `
        <div class="quiz-results">
            <h3>Quiz Concluído!</h3>
            <div class="result-stats">
                <div class="result-score">
                    <h4>${result.score}/${result.questions.length}</h4>
                    <p>${percentage}%</p>
                </div>
                <div class="result-details">
                    <p><strong>Tempo:</strong> ${Math.floor(duration / 60)}:${(
        duration % 60
    )
        .toString()
        .padStart(2, '0')}</p>
                    <p><strong>Dificuldade:</strong> ${result.difficulty}</p>
                    <p><strong>Performance:</strong> ${performanceMessage}</p>
                </div>
            </div>
            <div class="quiz-actions">
                <button id="new-quiz">Novo Quiz</button>
                <button id="back-to-dashboard">Voltar ao Dashboard</button>
            </div>
        </div>
    `;

    document.getElementById('new-quiz').addEventListener('click', () => {
        renderQuiz();
    });

    document
        .getElementById('back-to-dashboard')
        .addEventListener('click', () => {
            document.querySelectorAll('section').forEach((section) => {
                section.classList.remove('active-section');
            });
            document
                .getElementById('dashboard')
                .classList.add('active-section');
            updateDashboard();
        });
}

function renderQuizHistory() {
    const recentQuizzes = quizManager.quizHistory.slice(-5).reverse();

    if (recentQuizzes.length === 0) {
        return '<p>Nenhum quiz realizado ainda.</p>';
    }

    return recentQuizzes
        .map((quiz) => {
            const date = new Date(quiz.startTime).toLocaleDateString('pt-BR');
            return `
            <div class="quiz-history-item">
                <span>${date}</span>
                <span>${quiz.score}/${quiz.questions.length} (${quiz.percentage}%)</span>
                <span>${quiz.difficulty}</span>
            </div>
        `;
        })
        .join('');
}

// --- Legal Articles Extraction --- //
async function extractLegalArticles(text, fileName) {
    const prompt = `
    Você é um assistente jurídico especializado em legislação brasileira.
    Sua tarefa é identificar e extrair TODOS os artigos de lei do texto fornecido, incluindo artigos com letras (ex: Art. 311-A) e números com símbolos (ex: Art. 1º).
    O texto é um fluxo contínuo de um documento PDF, podendo conter cabeçalhos, rodapés e números de página que devem ser ignorados.

    REGRAS CRÍTICAS DE EXTRAÇÃO:
    1. Identifique cada artigo pelo padrão "Art. [número]", onde o número pode ser seguido por letras (ex: "Art. 311-A") ou símbolos (ex: "Art. 1º").
    2. CADA ARTIGO DEVE INCLUIR TODOS OS SEUS COMPONENTES:
       - Caput (texto principal do artigo)
       - Todos os parágrafos (§ 1º, § 2º, etc.)
       - Todos os incisos (I, II, III, etc.)
       - Todas as alíneas (a, b, c, etc.)
    3. NUNCA separe o caput dos seus parágrafos. Eles pertencem ao mesmo artigo.
    4. O conteúdo do artigo começa no "Art." e termina apenas quando encontrar o PRÓXIMO "Art." ou no final do texto.
    5. Para o campo "subject", forneça um resumo muito curto do que o artigo trata (ex: "Peculato", "Falsidade Ideológica").
    6. O campo "law" deve ser preenchido com o nome do arquivo, sem a extensão .pdf.

    Texto para análise:
    """
    ${text}
    """

    RESPONDA APENAS EM FORMATO JSON VÁLIDO, seguindo a estrutura abaixo. Se nenhum artigo for encontrado, retorne um array vazio [].

    {
      "articles": [
        {
          "number": "<número do artigo, ex: 299, 312-A, 1º>",
          "fullReference": "<referência completa, ex: Art. 299 do Código Penal>",
          "law": "<nome do arquivo sem .pdf>",
          "subject": "<resumo curto do artigo>",
          "fullText": "<texto COMPLETO do artigo incluindo CAPUT, PARÁGRAFOS, INCISOS e ALÍNEAS>",
          "paragraphs": [
            "<texto do parágrafo 1>",
            "<texto do parágrafo 2>"
          ],
          "context": "<contexto ou título do capítulo, se disponível>"
        }
      ]
    }
    `;

    try {
        let response = await callGemini(prompt);
        // Adicione esta linha para limpar a resposta da IA antes de analisar o JSON
        response = response.replace(/^```json\s*|\s*```$/g, '');
        const parsedResponse = JSON.parse(response);
        let articles = parsedResponse.articles || [];

        // Fallback mechanism: if AI returns too few articles, try manual extraction
        if (articles.length < 10) {
            // Threshold can be adjusted
            console.log(
                'IA retornou poucos artigos, tentando extração manual como fallback...'
            );
            const manualArticles = extractArticlesManually(text, fileName);
            if (manualArticles.length > articles.length) {
                console.log(
                    `Extração manual encontrou ${manualArticles.length} artigos.`
                );
                articles = manualArticles;
            }
        }

        return articles.map((article) => ({
            ...article,
            // **CORREÇÃO CRÍTICA**: Gerar ID consistente
            id: `article-${fileName.replace(/[^a-zA-Z0-9]/g, '_')}-${
                article.number
            }`,
            fileName: fileName,
            selected: false,
        }));
    } catch (error) {
        console.error(
            'Erro ao chamar a IA ou processar a resposta. Usando extração manual.',
            error
        );
        // If AI fails completely, use the robust manual method
        const manualArticles = extractArticlesManually(text, fileName);
        console.log(
            `Extração manual de fallback encontrou ${manualArticles.length} artigos.`
        );

        // Verificar se a extração manual encontrou artigos
        if (manualArticles.length === 0) {
            console.log('Tentando método alternativo de extração...');
            // Método alternativo como último recurso
            const alternativeArticles = alternativeExtraction(text, fileName);
            return alternativeArticles.map((article) => ({
                ...article,
                id: `article-${fileName}-${article.number}`,
                fileName: fileName,
                selected: false,
            }));
        }

        return manualArticles.map((article) => ({
            ...article,
            id: `article-${fileName}-${article.number}`,
            fileName: fileName,
            selected: false,
        }));
    }
}

// ============================================
// CACHE DE TIPOS DE LEI (OTIMIZAÇÃO)
// ============================================
const lawTypeCache = new Map();

function getLawType(fileName, text) {
    const cacheKey = fileName;
    if (!lawTypeCache.has(cacheKey)) {
        const lawType = detectLawType(fileName, text);
        lawTypeCache.set(cacheKey, lawType);
    }
    return lawTypeCache.get(cacheKey);
}

// ============================================
// FUNÇÃO AUXILIAR: DETECTAR O TIPO DE LEI (EXPANDIDA)
// ============================================
function detectLawType(fileName, text) {
    const fileNameLower = fileName.toLowerCase();
    const textLower = text.toLowerCase();
    const combined = (fileName + ' ' + text).toLowerCase();

    // PRIORIDADE MÁXIMA: Nome do arquivo
    if (
        fileNameLower.includes('constitucional') ||
        fileNameLower.includes('constituição')
    ) {
        return 'Direito Constitucional';
    }
    if (
        fileNameLower.includes('processo penal') ||
        fileNameLower.includes('processual penal')
    ) {
        return 'Direito Processual Penal';
    }
    if (
        fileNameLower.includes('processo civil') ||
        fileNameLower.includes('processual civil')
    ) {
        return 'Direito Processual Civil';
    }
    if (
        fileNameLower.includes('penal') &&
        !fileNameLower.includes('processo')
    ) {
        return 'Direito Penal';
    }
    if (fileNameLower.includes('administrativo')) {
        return 'Direito Administrativo';
    }
    if (fileNameLower.includes('juizados')) {
        if (fileNameLower.includes('fazenda')) {
            return 'Juizados Especiais da Fazenda Pública';
        }
        return 'Juizados Especiais';
    }
    if (
        fileNameLower.includes('deficiência') ||
        fileNameLower.includes('inclusão') ||
        fileNameLower.includes('pcd')
    ) {
        return 'Estatuto da Pessoa com Deficiência';
    }
    if (
        fileNameLower.includes('plano de cargos') ||
        fileNameLower.includes('carreiras') ||
        fileNameLower.includes('1.111')
    ) {
        return 'Plano de Cargos e Carreiras TJSP';
    }
    if (
        fileNameLower.includes('teletrabalho') ||
        fileNameLower.includes('850')
    ) {
        return 'Teletrabalho TJSP';
    }
    if (
        fileNameLower.includes('eproc') ||
        fileNameLower.includes('governança') ||
        fileNameLower.includes('963')
    ) {
        return 'Governança eProc TJSP';
    }
    if (fileNameLower.includes('regimento') && fileNameLower.includes('tjsp')) {
        return 'Regimento Interno TJSP';
    }
    if (
        fileNameLower.includes('corregedoria') ||
        fileNameLower.includes('nscgj')
    ) {
        return 'Normas da Corregedoria TJSP';
    }

    const lawIdentifiers = [
        // Constituição Federal (prioridade máxima)
        {
            identifiers: [
                'constituição da república federativa',
                'título ii - dos direitos e garantias fundamentais',
                'capítulo i - dos direitos e deveres individuais',
                'capítulo ii - dos direitos sociais',
                'capítulo iii - da nacionalidade',
                'capítulo vii - da administração pública',
                'preâmbulo',
                'nós, representantes do povo brasileiro',
            ],
            type: 'Direito Constitucional',
            weight: 5,
        },

        // Códigos Processuais
        {
            identifiers: [
                'decreto-lei nº 3.689',
                'código de processo penal',
                'cpp',
            ],
            type: 'Direito Processual Penal',
            weight: 3,
        },
        {
            identifiers: [
                'lei nº 13.105',
                'código de processo civil',
                'cpc',
                'novo cpc',
            ],
            type: 'Direito Processual Civil',
            weight: 3,
        },

        // Código Penal
        {
            identifiers: ['decreto-lei nº 2.848', 'código penal', 'cp'],
            type: 'Direito Penal',
            weight: 3,
        },

        // Legislação Administrativa
        {
            identifiers: [
                'lei nº 10.261',
                'estatuto dos funcionários públicos civis do estado',
                'funcionário público civil',
            ],
            type: 'Direito Administrativo',
            weight: 3,
        },
        {
            identifiers: [
                'lei nº 8.429',
                'atos de improbidade administrativa',
                'improbidade',
            ],
            type: 'Direito Administrativo',
            weight: 3,
        },

        // Juizados Especiais
        {
            identifiers: [
                'lei nº 9.099',
                'juizados especiais cíveis e criminais',
                'menor complexidade',
            ],
            type: 'Juizados Especiais',
            weight: 3,
        },
        {
            identifiers: [
                'lei nº 12.153',
                'juizados especiais da fazenda pública',
                'jefap',
            ],
            type: 'Juizados Especiais da Fazenda Pública',
            weight: 3,
        },

        // Estatuto da Pessoa com Deficiência
        {
            identifiers: [
                'lei brasileira de inclusão',
                'estatuto da pessoa com deficiência',
                'lei nº 13.146',
                'lbi',
            ],
            type: 'Estatuto da Pessoa com Deficiência',
            weight: 3,
        },

        // Legislação Interna TJSP
        {
            identifiers: [
                'lei complementar nº 1.111',
                'plano de cargos, carreiras e vencimentos',
                'servidores do poder judiciário',
            ],
            type: 'Plano de Cargos e Carreiras TJSP',
            weight: 3,
        },
        {
            identifiers: [
                'resolução nº 850/2021',
                'teletrabalho no âmbito',
                'trabalho remoto',
            ],
            type: 'Teletrabalho TJSP',
            weight: 3,
        },
        {
            identifiers: [
                'resolução nº 963/2025',
                'eproc',
                'processo judicial eletrônico',
            ],
            type: 'Governança eProc TJSP',
            weight: 3,
        },
        {
            identifiers: ['regimento interno do tribunal de justiça', 'ritjsp'],
            type: 'Regimento Interno TJSP',
            weight: 3,
        },
        {
            identifiers: ['normas da corregedoria geral da justiça', 'nscgj'],
            type: 'Normas da Corregedoria TJSP',
            weight: 3,
        },

        // Fallbacks contextuais
        {
            identifiers: [
                'inquérito policial',
                'fase investigatória',
                'denúncia',
            ],
            type: 'Direito Processual Penal',
            weight: 1,
        },
        {
            identifiers: [
                'petição inicial',
                'contestação',
                'audiência de conciliação',
            ],
            type: 'Direito Processual Civil',
            weight: 1,
        },
        {
            identifiers: ['crime', 'pena de reclusão', 'detenção'],
            type: 'Direito Penal',
            weight: 1,
        },
        {
            identifiers: ['servidor público', 'cargo público', 'vacância'],
            type: 'Direito Administrativo',
            weight: 1,
        },
        {
            identifiers: ['direitos fundamentais', 'garantias constitucionais'],
            type: 'Direito Constitucional',
            weight: 1,
        },
        {
            identifiers: ['tribunal de justiça do estado de são paulo', 'tjsp'],
            type: 'Legislação Interna TJSP',
            weight: 1,
        },
    ];

    let bestMatch = null;
    let bestScore = 0;

    for (const entry of lawIdentifiers) {
        let score = 0;
        for (const id of entry.identifiers) {
            if (combined.includes(id)) {
                score += entry.weight;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = entry.type;
        }
    }

    return bestMatch || 'Legislação Geral';
}

// ============================================
// FUNÇÃO UNIVERSAL PARA GERAR ASSUNTO DO ARTIGO
// ============================================
function generateArticleSubject(articleText, fileName = '') {
    const text = articleText.toLowerCase();
    const lawType = getLawType(fileName, articleText);

    switch (lawType) {
        case 'Direito Penal':
            return detectPenalSubject(text);
        case 'Direito Processual Penal':
            return detectProcessualPenalSubject(text);
        case 'Direito Processual Civil':
            return detectProcessualCivilSubject(text);
        case 'Direito Administrativo':
            return detectAdministrativoSubject(text);
        case 'Juizados Especiais':
            return detectJuizadosEspeciaisSubject(text);
        case 'Juizados Especiais da Fazenda Pública':
            return detectJuizadosFazendaSubject(text);
        case 'Direito Constitucional':
            return detectConstitucionalSubject(text);
        case 'Estatuto da Pessoa com Deficiência':
            return detectDeficienciaSubject(text);
        case 'Plano de Cargos e Carreiras TJSP':
            return detectPlanoCargosCargasSubject(text);
        case 'Teletrabalho TJSP':
            return detectTeletrabalhoSubject(text);
        case 'Governança eProc TJSP':
            return detectEProcSubject(text);
        case 'Regimento Interno TJSP':
            return detectRegimentoTJSPSubject(text);
        case 'Normas da Corregedoria TJSP':
            return detectCorregedoriaSubject(text);
        default:
            return 'Artigo de Lei';
    }
}

// ============================================
// DETECTORES ESPECIALIZADOS POR RAMO
// ============================================

function detectPenalSubject(text) {
    const patterns = [
        {
            keywords: ['homicídio', 'matar alguém', 'tirar a vida'],
            subject: 'Homicídio',
        },
        {
            keywords: ['lesão corporal', 'ofender a integridade', 'agredir'],
            subject: 'Lesão Corporal',
        },
        {
            keywords: ['estupro', 'violência sexual', 'conjunção carnal'],
            subject: 'Estupro',
        },
        {
            keywords: ['roubo', 'subtrair', 'grave ameaça', 'violência'],
            subject: 'Roubo',
        },
        {
            keywords: ['furto', 'coisa alheia móvel', 'subtrair'],
            subject: 'Furto',
        },
        {
            keywords: ['peculato', 'apropriar-se', 'funcionário público'],
            subject: 'Peculato',
        },
        {
            keywords: [
                'corrupção passiva',
                'solicitar',
                'receber',
                'vantagem indevida',
            ],
            subject: 'Corrupção Passiva',
        },
        {
            keywords: [
                'corrupção ativa',
                'oferecer',
                'prometer',
                'vantagem indevida',
            ],
            subject: 'Corrupção Ativa',
        },
        {
            keywords: ['concussão', 'exigir vantagem indevida'],
            subject: 'Concussão',
        },
        {
            keywords: ['prevaricação', 'retardar', 'deixar de praticar'],
            subject: 'Prevaricação',
        },
        {
            keywords: ['falso testemunho', 'fazer afirmação falsa'],
            subject: 'Falso Testemunho',
        },
        {
            keywords: ['denunciação caluniosa', 'dar causa', 'investigação'],
            subject: 'Denunciação Caluniosa',
        },
        {
            keywords: ['fraude processual', 'inovar artificiosamente'],
            subject: 'Fraude Processual',
        },
        {
            keywords: ['falsidade ideológica', 'omitir', 'documento público'],
            subject: 'Falsidade Ideológica',
        },
        {
            keywords: ['falsificação de documento', 'falsificar'],
            subject: 'Falsificação de Documento',
        },
        {
            keywords: ['uso de documento falso'],
            subject: 'Uso de Documento Falso',
        },
        {
            keywords: ['usurpação', 'função pública'],
            subject: 'Usurpação de Função Pública',
        },
        {
            keywords: ['resistência', 'opor-se à execução'],
            subject: 'Resistência',
        },
        {
            keywords: ['desacato', 'desacatar funcionário'],
            subject: 'Desacato',
        },
        {
            keywords: ['desobediência', 'desobedecer ordem legal'],
            subject: 'Desobediência',
        },
        {
            keywords: ['tráfico', 'drogas', 'entorpecentes'],
            subject: 'Tráfico de Drogas',
        },
        {
            keywords: ['estelionato', 'artifício', 'ardil', 'engano'],
            subject: 'Estelionato',
        },
        {
            keywords: ['extorsão', 'constranger', 'vantagem econômica'],
            subject: 'Extorsão',
        },
        {
            keywords: ['sequestro', 'cárcere privado', 'privar liberdade'],
            subject: 'Sequestro e Cárcere Privado',
        },
        { keywords: ['calúnia', 'imputar falsamente'], subject: 'Calúnia' },
        {
            keywords: ['difamação', 'imputar fato ofensivo'],
            subject: 'Difamação',
        },
        { keywords: ['injúria', 'ofender dignidade'], subject: 'Injúria' },
        { keywords: ['ameaça', 'prometer mal'], subject: 'Ameaça' },
        {
            keywords: ['constrangimento ilegal', 'constranger alguém'],
            subject: 'Constrangimento Ilegal',
        },
        { keywords: ['abandono de incapaz'], subject: 'Abandono de Incapaz' },
        { keywords: ['omissão de socorro'], subject: 'Omissão de Socorro' },
        { keywords: ['rixa', 'participar de rixa'], subject: 'Rixa' },
        { keywords: ['incêndio', 'fogo'], subject: 'Incêndio' },
        { keywords: ['dano', 'destruir', 'deteriorar'], subject: 'Dano' },
        { keywords: ['apropriação indébita'], subject: 'Apropriação Indébita' },
        {
            keywords: ['receptação', 'adquirir', 'produto de crime'],
            subject: 'Receptação',
        },
    ];
    return findBestMatch(text, patterns) || 'Direito Penal Geral';
}

function detectProcessualPenalSubject(text) {
    const patterns = [
        {
            keywords: ['juiz', 'impedimento', 'suspeição'],
            subject: 'Impedimento e Suspeição do Juiz',
        },
        {
            keywords: ['ministério público', 'titular', 'ação penal'],
            subject: 'Ministério Público',
        },
        {
            keywords: ['acusado', 'defensor', 'defesa técnica'],
            subject: 'Acusado e Defensor',
        },
        {
            keywords: ['assistente de acusação'],
            subject: 'Assistente de Acusação',
        },
        { keywords: ['citação', 'mandado', 'precatória'], subject: 'Citação' },
        { keywords: ['intimação', 'ciência'], subject: 'Intimação' },
        {
            keywords: ['inquérito policial', 'investigação'],
            subject: 'Inquérito Policial',
        },
        {
            keywords: ['ação penal', 'denúncia', 'queixa'],
            subject: 'Ação Penal',
        },
        {
            keywords: ['procedimento comum', 'ordinário', 'sumário'],
            subject: 'Procedimento Comum',
        },
        {
            keywords: ['tribunal do júri', 'jurados', 'pronúncia'],
            subject: 'Tribunal do Júri',
        },
        {
            keywords: ['sentença', 'absolvição', 'condenação'],
            subject: 'Sentença',
        },
        { keywords: ['recursos', 'apelação', 'agravo'], subject: 'Recursos' },
        {
            keywords: ['recurso em sentido estrito'],
            subject: 'Recurso em Sentido Estrito',
        },
        {
            keywords: ['embargos infringentes'],
            subject: 'Embargos Infringentes',
        },
        {
            keywords: [
                'habeas corpus',
                'coação ilegal',
                'liberdade de locomoção',
            ],
            subject: 'Habeas Corpus',
        },
        { keywords: ['revisão criminal'], subject: 'Revisão Criminal' },
        {
            keywords: ['prisão preventiva', 'prisão temporária'],
            subject: 'Prisão Preventiva',
        },
        {
            keywords: ['prisão em flagrante', 'flagrante delito'],
            subject: 'Prisão em Flagrante',
        },
        {
            keywords: ['liberdade provisória', 'fiança'],
            subject: 'Liberdade Provisória',
        },
        {
            keywords: ['medidas cautelares', 'alternativas'],
            subject: 'Medidas Cautelares',
        },
        { keywords: ['busca e apreensão'], subject: 'Busca e Apreensão' },
        { keywords: ['sequestro de bens'], subject: 'Sequestro de Bens' },
        { keywords: ['prova', 'pericial', 'testemunhal'], subject: 'Provas' },
        { keywords: ['interrogatório', 'acusado'], subject: 'Interrogatório' },
        { keywords: ['confissão'], subject: 'Confissão' },
        { keywords: ['acareação'], subject: 'Acareação' },
        {
            keywords: ['suspenção condicional da pena'],
            subject: 'Suspensão Condicional da Pena',
        },
        {
            keywords: ['livramento condicional'],
            subject: 'Livramento Condicional',
        },
        {
            keywords: ['execução penal', 'cumprimento'],
            subject: 'Execução Penal',
        },
    ];
    return findBestMatch(text, patterns) || 'Processo Penal Geral';
}

function detectProcessualCivilSubject(text) {
    const patterns = [
        {
            keywords: ['jurisdição', 'competência', 'foro'],
            subject: 'Jurisdição e Competência',
        },
        {
            keywords: ['impedimento', 'suspeição', 'juiz'],
            subject: 'Impedimento e Suspeição',
        },
        {
            keywords: ['auxiliares da justiça', 'escrivão', 'oficial'],
            subject: 'Auxiliares da Justiça',
        },
        {
            keywords: ['capacidade processual', 'legitimidade'],
            subject: 'Capacidade Processual',
        },
        { keywords: ['litisconsórcio'], subject: 'Litisconsórcio' },
        {
            keywords: ['intervenção de terceiros'],
            subject: 'Intervenção de Terceiros',
        },
        { keywords: ['assistência'], subject: 'Assistência' },
        { keywords: ['denunciação da lide'], subject: 'Denunciação da Lide' },
        {
            keywords: ['chamamento ao processo'],
            subject: 'Chamamento ao Processo',
        },
        {
            keywords: ['desconsideração da personalidade'],
            subject: 'Desconsideração da Personalidade Jurídica',
        },
        { keywords: ['amicus curiae'], subject: 'Amicus Curiae' },
        {
            keywords: ['atos processuais', 'forma', 'tempo'],
            subject: 'Atos Processuais',
        },
        { keywords: ['prazos', 'contagem', 'dias úteis'], subject: 'Prazos' },
        { keywords: ['preclusão'], subject: 'Preclusão' },
        { keywords: ['citação', 'réu'], subject: 'Citação' },
        { keywords: ['intimação', 'partes'], subject: 'Intimação' },
        { keywords: ['cartas', 'precatória', 'rogatória'], subject: 'Cartas' },
        {
            keywords: ['tutela provisória', 'urgência', 'evidência'],
            subject: 'Tutela Provisória',
        },
        { keywords: ['tutela antecipada'], subject: 'Tutela Antecipada' },
        { keywords: ['tutela cautelar'], subject: 'Tutela Cautelar' },
        {
            keywords: ['petição inicial', 'requisitos'],
            subject: 'Petição Inicial',
        },
        {
            keywords: ['audiência de conciliação', 'mediação'],
            subject: 'Audiência de Conciliação',
        },
        { keywords: ['contestação', 'resposta'], subject: 'Contestação' },
        {
            keywords: ['reconvenção', 'pedido contraposto'],
            subject: 'Reconvenção',
        },
        { keywords: ['revelia', 'presunção'], subject: 'Revelia' },
        {
            keywords: ['providências preliminares', 'saneamento'],
            subject: 'Saneamento',
        },
        {
            keywords: ['julgamento antecipado'],
            subject: 'Julgamento Antecipado',
        },
        {
            keywords: ['audiência de instrução', 'julgamento'],
            subject: 'Audiência de Instrução',
        },
        { keywords: ['provas', 'ônus', 'documental'], subject: 'Provas' },
        { keywords: ['prova testemunhal'], subject: 'Prova Testemunhal' },
        { keywords: ['prova pericial'], subject: 'Prova Pericial' },
        { keywords: ['inspeção judicial'], subject: 'Inspeção Judicial' },
        { keywords: ['sentença', 'dispositivo'], subject: 'Sentença' },
        { keywords: ['coisa julgada'], subject: 'Coisa Julgada' },
        {
            keywords: ['liquidação de sentença'],
            subject: 'Liquidação de Sentença',
        },
        {
            keywords: ['cumprimento de sentença', 'execução'],
            subject: 'Cumprimento de Sentença',
        },
        { keywords: ['penhora', 'bens'], subject: 'Penhora' },
        {
            keywords: ['arrematação', 'adjudicação'],
            subject: 'Arrematação e Adjudicação',
        },
        { keywords: ['recursos', 'apelação'], subject: 'Recursos' },
        {
            keywords: ['agravo de instrumento'],
            subject: 'Agravo de Instrumento',
        },
        { keywords: ['agravo interno'], subject: 'Agravo Interno' },
        {
            keywords: ['embargos de declaração'],
            subject: 'Embargos de Declaração',
        },
        { keywords: ['recurso especial', 'stj'], subject: 'Recurso Especial' },
        {
            keywords: ['recurso extraordinário', 'stf'],
            subject: 'Recurso Extraordinário',
        },
        { keywords: ['ação rescisória'], subject: 'Ação Rescisória' },
        { keywords: ['reclamação'], subject: 'Reclamação' },
        {
            keywords: ['suspensão de segurança'],
            subject: 'Suspensão de Segurança',
        },
    ];
    return findBestMatch(text, patterns) || 'Processo Civil Geral';
}

function detectAdministrativoSubject(text) {
    const patterns = [
        // Lei 10.261 - Estatuto
        {
            keywords: ['provimento', 'nomeação', 'investidura'],
            subject: 'Provimento de Cargo',
        },
        { keywords: ['posse', 'prazo', 'requisitos'], subject: 'Posse' },
        { keywords: ['exercício', 'início', 'prazo'], subject: 'Exercício' },
        {
            keywords: ['estágio probatório', 'confirmação'],
            subject: 'Estágio Probatório',
        },
        { keywords: ['estabilidade', 'efetivo'], subject: 'Estabilidade' },
        {
            keywords: ['vacância', 'exoneração', 'demissão', 'aposentadoria'],
            subject: 'Vacância',
        },
        {
            keywords: ['remoção', 'redistribuição'],
            subject: 'Remoção e Redistribuição',
        },
        { keywords: ['substituição', 'função'], subject: 'Substituição' },
        { keywords: ['readaptação', 'incapacidade'], subject: 'Readaptação' },
        { keywords: ['reversão', 'aposentadoria'], subject: 'Reversão' },
        { keywords: ['aproveitamento'], subject: 'Aproveitamento' },
        { keywords: ['reintegração', 'anulação'], subject: 'Reintegração' },
        { keywords: ['disponibilidade'], subject: 'Disponibilidade' },
        {
            keywords: ['vencimento', 'remuneração', 'vantagens'],
            subject: 'Vencimentos e Vantagens',
        },
        { keywords: ['gratificação', 'adicional'], subject: 'Gratificações' },
        { keywords: ['férias', 'direito'], subject: 'Férias' },
        { keywords: ['licença', 'afastamento'], subject: 'Licenças' },
        { keywords: ['deveres', 'obrigações'], subject: 'Deveres' },
        { keywords: ['proibições', 'vedações'], subject: 'Proibições' },
        { keywords: ['acumulação', 'cargos'], subject: 'Acumulação de Cargos' },
        {
            keywords: [
                'responsabilidade',
                'civil',
                'criminal',
                'administrativa',
            ],
            subject: 'Responsabilidades',
        },
        {
            keywords: ['penalidades', 'advertência', 'suspensão'],
            subject: 'Penalidades',
        },
        {
            keywords: ['processo administrativo', 'disciplinar', 'pad'],
            subject: 'Processo Disciplinar',
        },
        { keywords: ['sindicância', 'investigação'], subject: 'Sindicância' },
        { keywords: ['inassiduidade', 'faltas'], subject: 'Inassiduidade' },
        { keywords: ['abandono de cargo'], subject: 'Abandono de Cargo' },

        // Lei 8.429 - Improbidade
        {
            keywords: ['improbidade', 'administrativa'],
            subject: 'Improbidade Administrativa',
        },
        {
            keywords: ['enriquecimento ilícito', 'vantagem patrimonial'],
            subject: 'Enriquecimento Ilícito',
        },
        {
            keywords: ['prejuízo ao erário', 'lesão'],
            subject: 'Prejuízo ao Erário',
        },
        {
            keywords: ['princípios da administração', 'violação'],
            subject: 'Violação de Princípios',
        },
        {
            keywords: ['sanções', 'perda da função', 'multa'],
            subject: 'Sanções',
        },
        {
            keywords: ['indisponibilidade de bens'],
            subject: 'Indisponibilidade de Bens',
        },
        { keywords: ['sequestro', 'cautelar'], subject: 'Medidas Cautelares' },
        {
            keywords: [
                'procedimento administrativo',
                'investigação preliminar',
            ],
            subject: 'Procedimento Investigatório',
        },
        { keywords: ['ação de improbidade'], subject: 'Ação Judicial' },
        { keywords: ['acordo de não persecução', 'tac'], subject: 'Acordos' },
    ];
    return findBestMatch(text, patterns) || 'Direito Administrativo Geral';
}

function detectJuizadosEspeciaisSubject(text) {
    const patterns = [
        {
            keywords: ['competência', 'causas cíveis'],
            subject: 'Competência Cível',
        },
        {
            keywords: ['competência', 'infrações penais'],
            subject: 'Competência Criminal',
        },
        {
            keywords: ['juiz leigo', 'conciliador'],
            subject: 'Juiz Leigo e Conciliador',
        },
        { keywords: ['pedido', 'escrito', 'oral'], subject: 'Pedido Inicial' },
        { keywords: ['citação', 'intimação'], subject: 'Citação e Intimação' },
        {
            keywords: ['audiência de conciliação', 'composição'],
            subject: 'Audiência de Conciliação',
        },
        {
            keywords: ['instrução', 'julgamento'],
            subject: 'Instrução e Julgamento',
        },
        { keywords: ['resposta', 'contestação'], subject: 'Resposta do Réu' },
        { keywords: ['prova', 'testemunhas'], subject: 'Provas' },
        { keywords: ['sentença', 'líquida'], subject: 'Sentença' },
        { keywords: ['recurso', 'turma recursal'], subject: 'Recursos' },
        {
            keywords: ['embargos de declaração'],
            subject: 'Embargos de Declaração',
        },
        { keywords: ['execução', 'cumprimento'], subject: 'Execução' },
        {
            keywords: ['transação penal', 'composição civil'],
            subject: 'Transação Penal',
        },
        {
            keywords: ['suspensão condicional', 'sursis processual'],
            subject: 'Suspensão Condicional',
        },
        {
            keywords: ['termo circunstanciado', 'tc'],
            subject: 'Termo Circunstanciado',
        },
        { keywords: ['audiência preliminar'], subject: 'Audiência Preliminar' },
        {
            keywords: ['representação', 'ação penal pública'],
            subject: 'Representação',
        },
    ];
    return findBestMatch(text, patterns) || 'Juizados Especiais Geral';
}

function detectJuizadosFazendaSubject(text) {
    const patterns = [
        {
            keywords: ['competência', 'fazenda pública'],
            subject: 'Competência dos JEFAP',
        },
        {
            keywords: ['estados', 'distrito federal', 'municípios'],
            subject: 'Partes - Fazenda Pública',
        },
        { keywords: ['valor da causa', 'alçada'], subject: 'Valor da Causa' },
        { keywords: ['partes', 'legitimidade'], subject: 'Partes no Processo' },
        {
            keywords: ['citação', 'intimação', 'fazenda'],
            subject: 'Citação da Fazenda Pública',
        },
        {
            keywords: ['prazo diferenciado', 'fazenda'],
            subject: 'Prazos da Fazenda Pública',
        },
        {
            keywords: ['tutela', 'antecipada', 'cautelar'],
            subject: 'Tutelas de Urgência',
        },
        {
            keywords: ['sentença', 'reexame necessário'],
            subject: 'Sentença e Reexame',
        },
        { keywords: ['recurso', 'turma recursal'], subject: 'Recursos' },
        {
            keywords: ['cumprimento', 'precatório', 'rpv'],
            subject: 'Cumprimento de Sentença',
        },
        {
            keywords: ['uniformização', 'jurisprudência'],
            subject: 'Uniformização',
        },
        {
            keywords: ['assistência judiciária'],
            subject: 'Assistência Judiciária',
        },
    ];
    return (
        findBestMatch(text, patterns) || 'Juizados Especiais da Fazenda Pública'
    );
}

function detectConstitucionalSubject(text) {
    const patterns = [
        // Direitos e Garantias Fundamentais
        {
            keywords: ['princípio da igualdade', 'todos são iguais'],
            subject: 'Princípio da Igualdade',
        },
        {
            keywords: ['direito à vida', 'inviolabilidade'],
            subject: 'Direito à Vida',
        },
        {
            keywords: ['liberdade de expressão', 'manifestação do pensamento'],
            subject: 'Liberdade de Expressão',
        },
        {
            keywords: ['liberdade religiosa', 'crença', 'culto'],
            subject: 'Liberdade Religiosa',
        },
        {
            keywords: ['intimidade', 'vida privada', 'honra', 'imagem'],
            subject: 'Direito à Privacidade',
        },
        {
            keywords: ['inviolabilidade de domicílio', 'casa é asilo'],
            subject: 'Inviolabilidade Domiciliar',
        },
        {
            keywords: ['sigilo de correspondência', 'comunicações'],
            subject: 'Sigilo de Comunicações',
        },
        {
            keywords: ['liberdade de trabalho', 'profissão'],
            subject: 'Liberdade de Trabalho',
        },
        { keywords: ['acesso à informação'], subject: 'Acesso à Informação' },
        {
            keywords: ['liberdade de locomoção', 'ir e vir'],
            subject: 'Liberdade de Locomoção',
        },
        { keywords: ['direito de reunião'], subject: 'Direito de Reunião' },
        {
            keywords: ['liberdade de associação'],
            subject: 'Liberdade de Associação',
        },
        {
            keywords: ['direito de propriedade', 'função social'],
            subject: 'Direito de Propriedade',
        },
        {
            keywords: ['pequena propriedade rural'],
            subject: 'Pequena Propriedade Rural',
        },
        { keywords: ['direito de herança'], subject: 'Direito de Herança' },
        { keywords: ['defesa do consumidor'], subject: 'Defesa do Consumidor' },
        {
            keywords: ['princípio da legalidade', 'obrigado a fazer'],
            subject: 'Princípio da Legalidade',
        },
        {
            keywords: ['tortura', 'tratamento desumano'],
            subject: 'Proibição de Tortura',
        },
        {
            keywords: ['presunção de inocência'],
            subject: 'Presunção de Inocência',
        },
        {
            keywords: ['prisão', 'flagrante', 'ordem judicial'],
            subject: 'Prisão',
        },
        {
            keywords: ['devido processo legal'],
            subject: 'Devido Processo Legal',
        },
        {
            keywords: ['contraditório', 'ampla defesa'],
            subject: 'Contraditório e Ampla Defesa',
        },
        { keywords: ['provas ilícitas'], subject: 'Provas Ilícitas' },
        { keywords: ['tribunal do júri'], subject: 'Tribunal do Júri' },
        { keywords: ['extradição'], subject: 'Extradição' },

        // Direitos Sociais
        {
            keywords: ['direitos sociais', 'educação', 'saúde'],
            subject: 'Direitos Sociais',
        },
        { keywords: ['direito à educação'], subject: 'Direito à Educação' },
        { keywords: ['direito à saúde'], subject: 'Direito à Saúde' },
        {
            keywords: ['alimentação', 'moradia'],
            subject: 'Direito à Alimentação e Moradia',
        },
        {
            keywords: ['transporte', 'lazer'],
            subject: 'Direito ao Transporte e Lazer',
        },
        {
            keywords: ['segurança', 'previdência social'],
            subject: 'Segurança e Previdência',
        },
        {
            keywords: ['proteção à maternidade', 'infância'],
            subject: 'Proteção à Maternidade',
        },
        {
            keywords: ['assistência aos desamparados'],
            subject: 'Assistência Social',
        },

        // Direitos dos Trabalhadores
        {
            keywords: ['relação de emprego', 'proteção'],
            subject: 'Relação de Emprego',
        },
        { keywords: ['seguro-desemprego'], subject: 'Seguro-Desemprego' },
        { keywords: ['fgts', 'fundo de garantia'], subject: 'FGTS' },
        { keywords: ['salário mínimo'], subject: 'Salário Mínimo' },
        { keywords: ['décimo terceiro'], subject: 'Décimo Terceiro Salário' },
        {
            keywords: ['jornada de trabalho', 'horas'],
            subject: 'Jornada de Trabalho',
        },
        {
            keywords: ['repouso semanal', 'férias'],
            subject: 'Repouso e Férias',
        },
        {
            keywords: ['licença maternidade', 'paternidade'],
            subject: 'Licenças',
        },
        { keywords: ['aviso prévio'], subject: 'Aviso Prévio' },
        { keywords: ['adicional noturno', 'insalubre'], subject: 'Adicionais' },
        { keywords: ['aposentadoria'], subject: 'Aposentadoria' },
        {
            keywords: ['liberdade sindical', 'associação'],
            subject: 'Liberdade Sindical',
        },
        { keywords: ['direito de greve'], subject: 'Direito de Greve' },
        {
            keywords: ['participação nos lucros'],
            subject: 'Participação nos Lucros',
        },

        // Nacionalidade
        { keywords: ['brasileiros natos'], subject: 'Brasileiros Natos' },
        { keywords: ['brasileiros naturalizados'], subject: 'Naturalização' },
        {
            keywords: ['perda da nacionalidade'],
            subject: 'Perda da Nacionalidade',
        },

        // Direitos Políticos
        {
            keywords: ['soberania popular', 'sufrágio'],
            subject: 'Soberania Popular',
        },
        {
            keywords: ['alistamento eleitoral'],
            subject: 'Alistamento Eleitoral',
        },
        { keywords: ['condições de elegibilidade'], subject: 'Elegibilidade' },
        { keywords: ['inelegibilidade'], subject: 'Inelegibilidade' },
        {
            keywords: ['suspensão dos direitos políticos'],
            subject: 'Suspensão de Direitos Políticos',
        },

        // Administração Pública
        {
            keywords: [
                'princípios da administração',
                'legalidade',
                'impessoalidade',
            ],
            subject: 'Princípios Administrativos',
        },
        {
            keywords: ['cargos públicos', 'investidura'],
            subject: 'Cargos Públicos',
        },
        { keywords: ['concurso público'], subject: 'Concurso Público' },
        { keywords: ['acumulação de cargos'], subject: 'Acumulação de Cargos' },
        { keywords: ['estabilidade', 'servidor'], subject: 'Estabilidade' },
        {
            keywords: ['vencimentos', 'subsídios'],
            subject: 'Remuneração de Servidores',
        },
        {
            keywords: ['previdência dos servidores'],
            subject: 'Previdência de Servidores',
        },
        {
            keywords: ['contrato temporário'],
            subject: 'Contratação Temporária',
        },
        { keywords: ['licitação'], subject: 'Licitações' },
        { keywords: ['obras públicas'], subject: 'Obras Públicas' },
        { keywords: ['servidores militares'], subject: 'Servidores Militares' },

        // Poder Judiciário
        {
            keywords: ['poder judiciário', 'órgãos'],
            subject: 'Estrutura do Judiciário',
        },
        {
            keywords: ['supremo tribunal federal', 'stf'],
            subject: 'Supremo Tribunal Federal',
        },
        {
            keywords: ['superior tribunal de justiça', 'stj'],
            subject: 'Superior Tribunal de Justiça',
        },
        {
            keywords: ['tribunais regionais federais'],
            subject: 'Tribunais Regionais Federais',
        },
        { keywords: ['tribunais de justiça'], subject: 'Tribunais de Justiça' },
        { keywords: ['tribunais do trabalho'], subject: 'Justiça do Trabalho' },
        { keywords: ['tribunais eleitorais'], subject: 'Justiça Eleitoral' },
        { keywords: ['tribunais militares'], subject: 'Justiça Militar' },
        {
            keywords: ['garantias do juiz', 'vitaliciedade'],
            subject: 'Garantias da Magistratura',
        },
        {
            keywords: ['vedações aos magistrados'],
            subject: 'Vedações aos Magistrados',
        },
        {
            keywords: ['conselho nacional de justiça', 'cnj'],
            subject: 'Conselho Nacional de Justiça',
        },

        // Remédios Constitucionais
        { keywords: ['habeas corpus'], subject: 'Habeas Corpus' },
        {
            keywords: ['mandado de segurança', 'direito líquido'],
            subject: 'Mandado de Segurança',
        },
        { keywords: ['mandado de injunção'], subject: 'Mandado de Injunção' },
        { keywords: ['habeas data'], subject: 'Habeas Data' },
        { keywords: ['ação popular'], subject: 'Ação Popular' },

        // Controle de Constitucionalidade
        {
            keywords: ['ação direta de inconstitucionalidade', 'adin'],
            subject: 'ADI',
        },
        {
            keywords: ['ação declaratória de constitucionalidade'],
            subject: 'ADC',
        },
        { keywords: ['arguição de descumprimento', 'adpf'], subject: 'ADPF' },
    ];
    return findBestMatch(text, patterns) || 'Direito Constitucional Geral';
}

function detectDeficienciaSubject(text) {
    const patterns = [
        {
            keywords: ['disposições gerais', 'igualdade', 'não discriminação'],
            subject: 'Disposições Gerais - Igualdade',
        },
        {
            keywords: ['definição de deficiência', 'impedimento'],
            subject: 'Conceito de Deficiência',
        },
        {
            keywords: ['avaliação', 'biopsicossocial'],
            subject: 'Avaliação da Deficiência',
        },
        {
            keywords: ['acessibilidade', 'direito'],
            subject: 'Direito à Acessibilidade',
        },
        {
            keywords: ['desenho universal', 'concepção'],
            subject: 'Desenho Universal',
        },
        {
            keywords: ['tecnologia assistiva', 'ajuda técnica'],
            subject: 'Tecnologia Assistiva',
        },
        {
            keywords: ['barreiras', 'arquitetônicas', 'urbanísticas'],
            subject: 'Barreiras',
        },
        {
            keywords: ['comunicação', 'informação', 'libras'],
            subject: 'Comunicação e Informação',
        },
        { keywords: ['adaptações razoáveis'], subject: 'Adaptações Razoáveis' },
        {
            keywords: ['atendimento prioritário'],
            subject: 'Atendimento Prioritário',
        },
        {
            keywords: ['direito à vida', 'habilitação'],
            subject: 'Direito à Vida',
        },
        { keywords: ['direito à saúde'], subject: 'Direito à Saúde' },
        {
            keywords: ['habilitação', 'reabilitação'],
            subject: 'Habilitação e Reabilitação',
        },
        { keywords: ['direito à educação'], subject: 'Direito à Educação' },
        {
            keywords: ['educação inclusiva', 'sistema educacional'],
            subject: 'Educação Inclusiva',
        },
        {
            keywords: ['atendimento educacional especializado'],
            subject: 'Atendimento Especializado',
        },
        { keywords: ['direito à moradia'], subject: 'Direito à Moradia' },
        { keywords: ['direito ao trabalho'], subject: 'Direito ao Trabalho' },
        {
            keywords: ['colocação competitiva', 'trabalho'],
            subject: 'Colocação no Trabalho',
        },
        {
            keywords: ['habilitação profissional'],
            subject: 'Habilitação Profissional',
        },
        {
            keywords: ['direito à assistência social'],
            subject: 'Assistência Social',
        },
        {
            keywords: ['benefício de prestação continuada', 'bpc'],
            subject: 'BPC',
        },
        { keywords: ['direito à previdência'], subject: 'Previdência Social' },
        {
            keywords: ['cultura', 'esporte', 'turismo', 'lazer'],
            subject: 'Cultura, Esporte e Lazer',
        },
        {
            keywords: ['transporte', 'mobilidade'],
            subject: 'Transporte e Mobilidade',
        },
        {
            keywords: ['participação política'],
            subject: 'Participação na Vida Pública',
        },
        {
            keywords: ['capacidade civil', 'curatela'],
            subject: 'Capacidade Civil',
        },
        {
            keywords: ['tomada de decisão apoiada'],
            subject: 'Tomada de Decisão Apoiada',
        },
        { keywords: ['curatela'], subject: 'Curatela' },
        { keywords: ['crimes', 'penas'], subject: 'Crimes e Sanções' },
    ];
    return (
        findBestMatch(text, patterns) || 'Estatuto da Pessoa com Deficiência'
    );
}

function detectPlanoCargosCargasSubject(text) {
    const patterns = [
        {
            keywords: ['disposições preliminares', 'âmbito'],
            subject: 'Disposições Preliminares',
        },
        {
            keywords: ['quadro de pessoal', 'cargos'],
            subject: 'Quadro de Pessoal',
        },
        {
            keywords: ['estrutura das carreiras'],
            subject: 'Estrutura de Carreiras',
        },
        {
            keywords: ['requisitos', 'ingresso'],
            subject: 'Requisitos de Ingresso',
        },
        {
            keywords: ['atribuições', 'escrevente técnico'],
            subject: 'Atribuições - Escrevente',
        },
        {
            keywords: ['atribuições', 'oficial de justiça'],
            subject: 'Atribuições - Oficial',
        },
        {
            keywords: ['atribuições', 'assistente social'],
            subject: 'Atribuições - Assistente Social',
        },
        {
            keywords: ['atribuições', 'analista'],
            subject: 'Atribuições - Analista',
        },
        {
            keywords: ['jornada de trabalho', 'horas'],
            subject: 'Jornada de Trabalho',
        },
        { keywords: ['vencimentos', 'tabela'], subject: 'Vencimentos' },
        { keywords: ['subsídios', 'magistrados'], subject: 'Subsídios' },
        {
            keywords: ['concurso público', 'provimento'],
            subject: 'Concurso Público',
        },
        {
            keywords: ['estágio probatório', 'avaliação'],
            subject: 'Estágio Probatório',
        },
        { keywords: ['progressão', 'funcional'], subject: 'Progressão' },
        { keywords: ['promoção', 'classe'], subject: 'Promoção' },
        { keywords: ['acesso', 'carreira superior'], subject: 'Acesso' },
        { keywords: ['remoção', 'permuta'], subject: 'Remoção' },
        {
            keywords: ['gratificação', 'função'],
            subject: 'Gratificação de Função',
        },
        {
            keywords: ['gratificação judiciária'],
            subject: 'Gratificação Judiciária',
        },
        {
            keywords: ['adicional de qualificação', 'pós-graduação'],
            subject: 'Adicional de Qualificação',
        },
        {
            keywords: ['adicional por tempo de serviço', 'quinquênio'],
            subject: 'Adicional por Tempo',
        },
        { keywords: ['sexta-parte'], subject: 'Sexta-Parte' },
        { keywords: ['ajuda de custo'], subject: 'Ajuda de Custo' },
        { keywords: ['diárias'], subject: 'Diárias' },
        { keywords: ['férias-prêmio'], subject: 'Férias-Prêmio' },
        { keywords: ['licença', 'afastamento'], subject: 'Licenças' },
        {
            keywords: ['desenvolvimento funcional'],
            subject: 'Desenvolvimento Funcional',
        },
        { keywords: ['comitê de recursos humanos'], subject: 'Comitê de RH' },
        {
            keywords: ['avaliação de desempenho'],
            subject: 'Avaliação de Desempenho',
        },
        { keywords: ['readaptação'], subject: 'Readaptação' },
    ];
    return findBestMatch(text, patterns) || 'Plano de Cargos e Carreiras';
}

function detectTeletrabalhoSubject(text) {
    const patterns = [
        {
            keywords: ['conceito', 'teletrabalho', 'definição'],
            subject: 'Conceito de Teletrabalho',
        },
        {
            keywords: ['objetivos', 'finalidade'],
            subject: 'Objetivos do Teletrabalho',
        },
        {
            keywords: ['modalidades', 'integral', 'parcial'],
            subject: 'Modalidades',
        },
        {
            keywords: ['requisitos', 'elegibilidade'],
            subject: 'Requisitos para Adesão',
        },
        {
            keywords: ['magistrado', 'juiz'],
            subject: 'Teletrabalho de Magistrados',
        },
        {
            keywords: ['servidor', 'escrevente'],
            subject: 'Teletrabalho de Servidores',
        },
        {
            keywords: ['pessoa com deficiência', 'doença grave'],
            subject: 'Teletrabalho PCD',
        },
        {
            keywords: ['termo de adesão', 'formalização'],
            subject: 'Formalização',
        },
        {
            keywords: ['deveres', 'obrigações'],
            subject: 'Deveres do Teletrabalhador',
        },
        {
            keywords: ['metas', 'produtividade'],
            subject: 'Metas de Produtividade',
        },
        {
            keywords: ['controle', 'frequência'],
            subject: 'Controle de Frequência',
        },
        {
            keywords: ['equipamentos', 'infraestrutura'],
            subject: 'Equipamentos e Infraestrutura',
        },
        {
            keywords: ['segurança da informação'],
            subject: 'Segurança da Informação',
        },
        { keywords: ['vedações', 'proibições'], subject: 'Vedações' },
        {
            keywords: ['desligamento', 'retorno'],
            subject: 'Desligamento do Teletrabalho',
        },
        { keywords: ['avaliação', 'desempenho'], subject: 'Avaliação' },
        { keywords: ['supervisão', 'chefia'], subject: 'Supervisão' },
        {
            keywords: ['comparecimento presencial'],
            subject: 'Comparecimento Presencial',
        },
    ];
    return findBestMatch(text, patterns) || 'Teletrabalho TJSP';
}

function detectEProcSubject(text) {
    const patterns = [
        {
            keywords: ['disposições gerais', 'âmbito'],
            subject: 'Disposições Gerais eProc',
        },
        {
            keywords: ['princípios', 'diretrizes'],
            subject: 'Princípios do eProc',
        },
        { keywords: ['governança', 'gestão'], subject: 'Governança' },
        { keywords: ['comitê gestor', 'cge'], subject: 'Comitê Gestor' },
        {
            keywords: ['coordenadoria', 'coeproc'],
            subject: 'Coordenadoria do eProc',
        },
        { keywords: ['subcomitê'], subject: 'Subcomitês' },
        { keywords: ['implantação', 'migração'], subject: 'Implantação' },
        {
            keywords: ['cadastramento', 'usuários'],
            subject: 'Cadastro de Usuários',
        },
        { keywords: ['credenciamento', 'advogado'], subject: 'Credenciamento' },
        {
            keywords: ['certificado digital', 'assinatura'],
            subject: 'Certificação Digital',
        },
        { keywords: ['peticionamento', 'inicial'], subject: 'Peticionamento' },
        { keywords: ['distribuição', 'automática'], subject: 'Distribuição' },
        {
            keywords: ['movimentação processual', 'eventos'],
            subject: 'Movimentação',
        },
        {
            keywords: ['citação', 'intimação', 'eletrônica'],
            subject: 'Comunicações Processuais',
        },
        { keywords: ['prazos', 'contagem'], subject: 'Prazos' },
        {
            keywords: ['indisponibilidade', 'sistema'],
            subject: 'Indisponibilidade',
        },
        { keywords: ['consulta processual'], subject: 'Consulta' },
        {
            keywords: ['juntada de documentos'],
            subject: 'Juntada de Documentos',
        },
        {
            keywords: ['audiências', 'videoconferência'],
            subject: 'Audiências Virtuais',
        },
        { keywords: ['segurança', 'sigilo'], subject: 'Segurança e Sigilo' },
        {
            keywords: ['backup', 'preservação'],
            subject: 'Backup e Preservação',
        },
        { keywords: ['suporte técnico'], subject: 'Suporte Técnico' },
        { keywords: ['treinamento', 'capacitação'], subject: 'Capacitação' },
    ];
    return findBestMatch(text, patterns) || 'Governança eProc TJSP';
}

function detectRegimentoTJSPSubject(text) {
    const patterns = [
        {
            keywords: ['disposições gerais', 'competência'],
            subject: 'Disposições Gerais TJSP',
        },
        { keywords: ['órgão especial'], subject: 'Órgão Especial' },
        { keywords: ['conselho superior'], subject: 'Conselho Superior' },
        { keywords: ['tribunal pleno'], subject: 'Tribunal Pleno' },
        { keywords: ['câmaras', 'seções'], subject: 'Câmaras e Seções' },
        { keywords: ['turmas julgadoras'], subject: 'Turmas Julgadoras' },
        { keywords: ['presidência'], subject: 'Presidência' },
        { keywords: ['vice-presidência'], subject: 'Vice-Presidência' },
        { keywords: ['corregedoria geral'], subject: 'Corregedoria Geral' },
        { keywords: ['desembargadores'], subject: 'Desembargadores' },
        { keywords: ['juízes de primeiro grau'], subject: 'Juízes de 1º Grau' },
        { keywords: ['servidores', 'competências'], subject: 'Servidores' },
        {
            keywords: ['processos', 'distribuição'],
            subject: 'Distribuição de Processos',
        },
        {
            keywords: ['julgamento', 'procedimento'],
            subject: 'Procedimentos de Julgamento',
        },
        { keywords: ['sessões'], subject: 'Sessões' },
        { keywords: ['sustentação oral'], subject: 'Sustentação Oral' },
        { keywords: ['acórdão'], subject: 'Acórdão' },
        { keywords: ['recursos', 'processamento'], subject: 'Recursos' },
        {
            keywords: ['uniformização de jurisprudência'],
            subject: 'Uniformização',
        },
        { keywords: ['incidente de resolução de demandas'], subject: 'IRDR' },
    ];
    return findBestMatch(text, patterns) || 'Regimento Interno TJSP';
}

function detectCorregedoriaSubject(text) {
    const patterns = [
        {
            keywords: ['disposições gerais', 'corregedoria'],
            subject: 'Disposições Gerais',
        },
        { keywords: ['serventias judiciais'], subject: 'Serventias Judiciais' },
        { keywords: ['distribuição', 'processos'], subject: 'Distribuição' },
        {
            keywords: ['recebimento', 'autuação'],
            subject: 'Recebimento e Autuação',
        },
        { keywords: ['registro', 'informações'], subject: 'Registro' },
        { keywords: ['carga', 'vista'], subject: 'Carga e Vista' },
        { keywords: ['juntada', 'documentos'], subject: 'Juntada' },
        { keywords: ['publicação', 'expedientes'], subject: 'Publicação' },
        { keywords: ['expedição', 'cartas'], subject: 'Expedição de Cartas' },
        { keywords: ['certidões'], subject: 'Certidões' },
        { keywords: ['arquivamento'], subject: 'Arquivamento' },
        { keywords: ['prazos processuais'], subject: 'Prazos' },
        { keywords: ['atos ordinatórios'], subject: 'Atos Ordinatórios' },
        { keywords: ['correição', 'inspeção'], subject: 'Correições' },
        {
            keywords: ['reclamação correicional'],
            subject: 'Reclamação Correicional',
        },
        { keywords: ['representação'], subject: 'Representação' },
        { keywords: ['sindicância'], subject: 'Sindicância' },
        { keywords: ['penalidades'], subject: 'Penalidades' },
        { keywords: ['ouvidoria'], subject: 'Ouvidoria' },
    ];
    return findBestMatch(text, patterns) || 'Normas da Corregedoria TJSP';
}

// ============================================
// FUNÇÃO AUXILIAR: ENCONTRAR MELHOR CORRESPONDÊNCIA
// ============================================
function findBestMatch(text, patterns) {
    let bestMatch = null;
    let bestScore = 0;

    for (const pattern of patterns) {
        let score = 0;
        for (const keyword of pattern.keywords) {
            if (text.includes(keyword)) {
                score++;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = pattern.subject;
        }
    }
    return bestMatch;
}

// ============================================
// FUNÇÕES DE EXTRAÇÃO
// ============================================
function extractParagraphsFromArticle(articleText) {
    const paragraphs = [];
    const paragraphRegex = /(§\s*\d+[º°]?[^§]*)/gi;
    const paragraphMatches = articleText.match(paragraphRegex);

    if (paragraphMatches) {
        paragraphMatches.forEach((paragraph) => {
            const cleanParagraph = paragraph.replace(/\s+/g, ' ').trim();
            if (cleanParagraph.length > 5) {
                paragraphs.push(cleanParagraph);
            }
        });
    }
    return paragraphs;
}

function alternativeExtraction(text, fileName) {
    console.log('Usando método alternativo de extração...');
    const articles = [];
    const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\* /g, '')
        .replace(/\s+/g, ' ')
        .replace(/\n/g, ' ')
        .trim();

    const articlePattern =
        /Art(?:igo)?\.?\s*(\d+[º°]?(?:-?[A-Z])?(?:\s*[º°])?\.?)[^A-Z]*?(?=Art(?:igo)?\.?\s*\d|$)/gi;
    let match;

    while ((match = articlePattern.exec(cleanText)) !== null) {
        const articleNumber = match[1].replace(/\.$/, '');
        const articleContent = match[0].trim();

        if (articleContent.length > 10) {
            const subject = generateArticleSubject(articleContent, fileName);

            articles.push({
                number: articleNumber,
                fullReference: `Art. ${articleNumber}`,
                law: fileName.replace('.pdf', ''),
                subject: subject,
                fullText: articleContent,
                paragraphs: extractParagraphsFromArticle(articleContent),
                context: 'Extração alternativa',
            });
        }
    }

    console.log(`Método alternativo encontrou ${articles.length} artigos.`);
    return articles;
}

function extractArticlesManually(text, fileName) {
    console.log('Executando extração manual robusta...');
    const articles = [];
    const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\* /g, '')
        .replace(/\s+/g, ' ')
        .replace(/\n/g, ' ')
        .trim();

    const articleRegex =
        /(Art(?:igo)?\.?\s*\d+[º°]?(?:-?[A-Z])?(?:\s*[º°])?\.?)[\s\S]*?(?=(?:Art(?:igo)?\.?\s*\d+[º°]?(?:-?[A-Z])?(?:\s*[º°])?\.?)|$)/gi;

    let matches = [];
    let match;

    while ((match = articleRegex.exec(cleanText)) !== null) {
        matches.push(match[0]);
    }

    if (matches.length === 0) {
        console.log('Nenhum artigo encontrado com a regex principal.');
        return articles;
    }

    console.log(`Encontrados ${matches.length} artigos brutos.`);

    matches.forEach((match, index) => {
        const trimmedMatch = match.trim();
        const articleNumberMatch = trimmedMatch.match(
            /^(Art(?:igo)?\.?\s*)(\d+[º°]?(?:-?[A-Z])?(?:\s*[º°])?\.?)/i
        );

        if (articleNumberMatch) {
            const articleNumber = articleNumberMatch[2].replace(/\.$/, '');
            const cleanArticleText = trimmedMatch
                .replace(
                    /^\s*Art(?:igo)?\.?\s*\d+[º°]?(?:-?[A-Z])?(?:\s*[º°])?\.?\s*/,
                    ''
                )
                .replace(/\s+/g, ' ')
                .trim();

            const fullText = `Art. ${articleNumber} ${cleanArticleText}`;
            const subject = generateArticleSubject(fullText, fileName);

            articles.push({
                number: articleNumber,
                fullReference: `Art. ${articleNumber}`,
                law: fileName.replace('.pdf', ''),
                subject: subject,
                fullText: fullText,
                paragraphs: extractParagraphsFromArticle(fullText),
                context: 'Extração manual',
            });

            console.log(
                `Artigo ${index + 1}: Art. ${articleNumber} - ${subject}`
            );
        }
    });

    console.log(
        `Extração manual finalizada: ${articles.length} artigos processados.`
    );
    return articles;
}

// ============================================
// FUNÇÃO PRINCIPAL DE EXTRAÇÃO
// ============================================
function extractAllArticles(text, fileName) {
    console.log(`\n========================================`);
    console.log(`Iniciando extração para: ${fileName}`);
    console.log(`========================================\n`);

    // Primeiro tenta extração manual
    let articles = extractArticlesManually(text, fileName);

    // Se não encontrou artigos suficientes, tenta método alternativo
    if (articles.length === 0) {
        console.log('Tentando método alternativo...');
        articles = alternativeExtraction(text, fileName);
    }

    console.log(`\nTotal de artigos extraídos: ${articles.length}`);
    console.log(`========================================\n`);

    return articles;
}

// ============================================
// FUNÇÕES DE VALIDAÇÃO E ESTATÍSTICAS
// ============================================
function validateExtraction(articles) {
    const stats = {
        total: articles.length,
        withParagraphs: 0,
        withoutParagraphs: 0,
        byLawType: {},
        bySubject: {},
        averageLength: 0,
        minLength: Infinity,
        maxLength: 0,
    };

    let totalLength = 0;

    articles.forEach((article) => {
        // Contagem de parágrafos
        if (article.paragraphs && article.paragraphs.length > 0) {
            stats.withParagraphs++;
        } else {
            stats.withoutParagraphs++;
        }

        // Comprimento do texto
        const length = article.fullText.length;
        totalLength += length;
        stats.minLength = Math.min(stats.minLength, length);
        stats.maxLength = Math.max(stats.maxLength, length);

        // Tipo de lei
        const lawType = getLawType(article.law, article.fullText);
        stats.byLawType[lawType] = (stats.byLawType[lawType] || 0) + 1;

        // Assunto
        stats.bySubject[article.subject] =
            (stats.bySubject[article.subject] || 0) + 1;
    });

    stats.averageLength = Math.round(totalLength / articles.length);

    return stats;
}

function printExtractionReport(articles) {
    const stats = validateExtraction(articles);

    console.log('\n========================================');
    console.log('RELATÓRIO DE EXTRAÇÃO');
    console.log('========================================\n');

    console.log(`Total de artigos: ${stats.total}`);
    console.log(`Artigos com parágrafos: ${stats.withParagraphs}`);
    console.log(`Artigos sem parágrafos: ${stats.withoutParagraphs}`);
    console.log(`\nComprimento médio: ${stats.averageLength} caracteres`);
    console.log(`Menor artigo: ${stats.minLength} caracteres`);
    console.log(`Maior artigo: ${stats.maxLength} caracteres`);

    console.log('\n--- Distribuição por Tipo de Lei ---');
    Object.entries(stats.byLawType)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
            console.log(`${type}: ${count} artigos`);
        });

    console.log('\n--- Top 10 Assuntos Mais Frequentes ---');
    Object.entries(stats.bySubject)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([subject, count]) => {
            console.log(`${subject}: ${count} artigos`);
        });

    console.log('\n========================================\n');
}

// ============================================
// FUNÇÃO DE BUSCA E FILTRO
// ============================================
function searchArticles(articles, query) {
    const queryLower = query.toLowerCase();

    return articles.filter((article) => {
        return (
            article.number.toLowerCase().includes(queryLower) ||
            article.subject.toLowerCase().includes(queryLower) ||
            article.fullText.toLowerCase().includes(queryLower) ||
            article.law.toLowerCase().includes(queryLower)
        );
    });
}

function filterByLawType(articles, lawType) {
    return articles.filter((article) => {
        return getLawType(article.law, article.fullText) === lawType;
    });
}

function filterBySubject(articles, subject) {
    return articles.filter((article) => {
        return article.subject.toLowerCase().includes(subject.toLowerCase());
    });
}

// ============================================
// FUNÇÃO DE EXPORTAÇÃO
// ============================================
function exportToJSON(articles, fileName = 'artigos_extraidos.json') {
    const data = {
        metadata: {
            totalArticles: articles.length,
            extractionDate: new Date().toISOString(),
            laws: [...new Set(articles.map((a) => a.law))],
            lawTypes: [
                ...new Set(articles.map((a) => getLawType(a.law, a.fullText))),
            ],
        },
        articles: articles,
    };

    return JSON.stringify(data, null, 2);
}

function exportToCSV(articles) {
    const headers = [
        'Número',
        'Lei',
        'Tipo de Lei',
        'Assunto',
        'Texto Completo',
        'Tem Parágrafos',
    ];
    const rows = articles.map((article) => {
        const lawType = getLawType(article.law, article.fullText);
        const hasParagraphs =
            article.paragraphs && article.paragraphs.length > 0 ? 'Sim' : 'Não';

        return [
            article.number,
            article.law,
            lawType,
            article.subject,
            `"${article.fullText.replace(/"/g, '""')}"`,
            hasParagraphs,
        ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
}

// ============================================
// EXEMPLOS DE USO
// ============================================

/*
// Exemplo 1: Extrair artigos de um texto
const textoLei = `... seu texto aqui ...`;
const nomeArquivo = 'lei-complementar-1111.pdf';
const artigos = extractAllArticles(textoLei, nomeArquivo);

// Exemplo 2: Gerar relatório
printExtractionReport(artigos);

// Exemplo 3: Buscar artigos
const resultadoBusca = searchArticles(artigos, 'teletrabalho');
console.log(`Encontrados ${resultadoBusca.length} artigos sobre teletrabalho`);

// Exemplo 4: Filtrar por tipo
const artigosConstitucionais = filterByLawType(artigos, 'Direito Constitucional');
console.log(`Artigos constitucionais: ${artigosConstitucionais.length}`);

// Exemplo 5: Exportar para JSON
const jsonData = exportToJSON(artigos);
console.log(jsonData);

// Exemplo 6: Exportar para CSV
const csvData = exportToCSV(artigos);
console.log(csvData);
*/

// ============================================
// EXPORTAR FUNÇÕES PARA USO EXTERNO
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractAllArticles,
        extractArticlesManually,
        alternativeExtraction,
        generateArticleSubject,
        getLawType,
        detectLawType,
        searchArticles,
        filterByLawType,
        filterBySubject,
        validateExtraction,
        printExtractionReport,
        exportToJSON,
        exportToCSV,
    };
}

// --- Article-based Content Generation --- //
async function generateFlashcardFromArticle(
    article,
    focus,
    specificFocus = '',
    style = 'direct'
) {
    // CORREÇÃO: Melhorar o prompt para ser mais específico
    const focusPrompts = {
        general: 'visão completa e geral do artigo',
        detailed:
            'detalhes específicos como prazos, valores, penas e qualificadoras',
        conceptual: 'definições e conceitos jurídicos presentes',
        procedural: 'etapas, trâmites e procedimentos descritos',
        specific: specificFocus || 'aspectos específicos do artigo',
    };

    const stylePrompts = {
        direct: 'pergunta direta e resposta objetiva',
        contextual: 'situação prática contextualizada',
        comparative: 'comparações com outros institutos jurídicos',
        application: 'aplicação prática do artigo',
    };

    const prompt = `
Com base EXCLUSIVAMENTE no seguinte artigo de lei, crie UM flashcard educativo no formato especificado:

**ARTIGO DE LEI:**
- Referência: ${article.fullReference}
- Lei: ${article.law}
- Assunto: ${article.subject}
- Texto Completo: ${article.fullText || 'Texto não disponível'}
- Contexto: ${article.context || ''}

**INSTRUÇÕES ESPECÍFICAS:**
- Foco: ${focusPrompts[focus]}
- Estilo: ${stylePrompts[style]}
- Crie UMA pergunta clara e específica sobre este artigo
- A resposta deve ser concisa mas completa (máximo 150 palavras)
- Use terminologia jurídica apropriada
- Baseie-se APENAS no texto do artigo fornecido
- A pergunta deve testar compreensão, não apenas memorização

**FORMATO DE RESPOSTA OBRIGATÓRIO:**
PERGUNTA: [sua pergunta aqui]
RESPOSTA: [sua resposta aqui]

NÃO inclua qualquer outro texto, explicações ou comentários além do formato especificado.`;

    try {
        const response = await callGemini(prompt);
        console.log(
            `[DEBUG] Resposta da API para ${article.fullReference}:`,
            response
        );

        if (response) {
            let question = '';
            let answer = '';

            // CORREÇÃO: Método de extração mais robusto
            const lines = response
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line);

            for (let i = 0; i < lines.length; i++) {
                if (
                    lines[i].startsWith('PERGUNTA:') ||
                    lines[i].startsWith('Pergunta:')
                ) {
                    question = lines[i]
                        .replace(/^(PERGUNTA:|Pergunta:)\s*/i, '')
                        .trim();
                    // Verifica se a resposta está na mesma linha ou na próxima
                    if (
                        i + 1 < lines.length &&
                        (lines[i + 1].startsWith('RESPOSTA:') ||
                            lines[i + 1].startsWith('Resposta:'))
                    ) {
                        answer = lines[i + 1]
                            .replace(/^(RESPOSTA:|Resposta:)\s*/i, '')
                            .trim();
                    } else if (
                        question.includes('RESPOSTA:') ||
                        question.includes('Resposta:')
                    ) {
                        // Caso estejam na mesma linha
                        const parts = question.split(/RESPOSTA:|Resposta:/i);
                        question = parts[0].trim();
                        answer = parts[1] ? parts[1].trim() : '';
                    }
                    break;
                }
            }

            // Fallback se ainda não encontrou
            if (!question || !answer) {
                const responseClean = response.replace(/\*\*/g, '');
                const questionMatch = responseClean.match(
                    /(PERGUNTA|Pergunta)[:\s]*([^\n\r]*)/i
                );
                const answerMatch = responseClean.match(
                    /(RESPOSTA|Resposta)[:\s]*([^\n\r]*)/i
                );

                question = questionMatch ? questionMatch[2].trim() : '';
                answer = answerMatch ? answerMatch[2].trim() : '';
            }

            // Fallback final se ainda estiver vazio
            if (!question || !answer) {
                console.warn(`Criando fallback para ${article.fullReference}`);
                question = `Explique o conteúdo e aplicação do ${article.fullReference}`;
                answer = `O ${article.fullReference} trata sobre: ${
                    article.subject
                }. ${
                    article.fullText
                        ? article.fullText.substring(0, 200) + '...'
                        : ''
                }`;
            }

            console.log(
                `[DEBUG] Extraído -> Pergunta: "${question.substring(
                    0,
                    50
                )}...", Resposta: "${answer.substring(0, 50)}..."`
            );

            const flashcard = {
                id: `flashcard-${Date.now()}-${Math.random()
                    .toString(36)
                    .substr(2, 9)}`,
                question: question,
                answer: answer,
                chunkId: `article-${article.number}`,
                easiness: 2.5,
                interval: 1,
                repetitions: 0,
                nextReview: new Date(),
                created: new Date(),
                lastReviewed: null,
                viewCount: 0,
                isFavorite: false,
                isArchived: false,
                customName: '',
                sourceTrack: article.fileName,
                articleReference: article.fullReference,
                articleSubject: article.subject,
                law: article.law,
                generationFocus: focus,
                specificFocus: specificFocus,
                style: style,
            };

            lexiaFlashcards.push(flashcard);
            saveFlashcards();

            console.log(`✅ Flashcard criado para ${article.fullReference}`);
            return flashcard;
        }
    } catch (error) {
        console.error(
            `❌ Erro ao gerar flashcard para ${article.fullReference}:`,
            error
        );
    }

    return null;
}

async function generateQuizFromArticle(article, contentFocus, questionNumber) {
    const focusPrompts = {
        complete: 'Crie uma questão abrangente sobre todo o conteúdo do artigo',
        definition: 'Foque nas definições e conceitos principais do artigo',
        penalties: 'Concentre-se nas penas, sanções e punições previstas',
        procedures: 'Enfatize os procedimentos e trâmites descritos',
        exceptions: 'Destaque as exceções, casos especiais e particularidades',
    };

    const prompt = `
Crie uma questão de múltipla escolha baseada no seguinte artigo de lei:

**Artigo:** ${article.fullReference}
**Lei:** ${article.law}
**Assunto:** ${article.subject}
**Texto:** ${article.fullText || 'Texto não disponível'}
**Contexto:** ${article.context || ''}

**Foco:** ${focusPrompts[contentFocus]}
**Questão número:** ${questionNumber} (varie o tipo e dificuldade)

Crie uma questão de múltipla escolha com 4 alternativas (A, B, C, D), sendo apenas uma correta.
A questão deve ser específica sobre este artigo e testar conhecimento jurídico relevante.

Responda em formato JSON:
{
  "question": "Pergunta clara sobre o artigo",
  "options": {
    "A": "Primeira alternativa",
    "B": "Segunda alternativa", 
    "C": "Terceira alternativa",
    "D": "Quarta alternativa"
  },
  "correctAnswer": "A",
  "explanation": "Explicação detalhada da resposta correta"
}
`;

    try {
        const response = await callGemini(prompt);
        if (response) {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const quizData = JSON.parse(jsonMatch[0]);

                // Add to quiz manager's question bank
                const question = {
                    id: `article-question-${Date.now()}-${Math.random()
                        .toString(36)
                        .substr(2, 9)}`,
                    question: quizData.question,
                    options: Object.values(quizData.options),
                    correctAnswer: quizData.correctAnswer.charCodeAt(0) - 65,
                    explanation: quizData.explanation,
                    source: 'article',
                    articleReference: article.fullReference,
                    articleSubject: article.subject,
                    law: article.law,
                    difficulty: 'medium',
                    createdAt: new Date().toISOString(),
                };

                // Add to quiz manager's question bank
                if (!quizManager.questionBank) {
                    quizManager.questionBank = [];
                }
                quizManager.questionBank.push(question);
                quizManager.saveQuizData();

                console.log(`Questão criada para ${article.fullReference}`);
                return question;
            }
        }
    } catch (error) {
        console.error(
            `Erro ao gerar questão para ${article.fullReference}:`,
            error
        );
    }

    return null;
}

// --- Gemini API Integration --- //
async function callGemini(prompt, model = 'gemini-2.0-flash', retryCount = 0) {
    const API_KEY = lexiaConfig.geminiApiKey;
    if (!API_KEY) {
        alert(
            'Por favor, configure sua chave da API Gemini nas configurações.'
        );
        return null;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const requestBody = {
        contents: [
            {
                parts: [
                    {
                        text: prompt,
                    },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
        },
    };

    const maxRetries = 3;
    const baseDelay = 2000;

    try {
        if (retryCount > 0) {
            const delay = baseDelay * Math.pow(2, retryCount - 1);
            console.log(
                `Aguardando ${delay}ms antes de tentar novamente (tentativa ${
                    retryCount + 1
                })...`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API Error:', errorData.error);

            // Handle rate limiting (429) and quota exceeded errors
            if (
                response.status === 429 ||
                (errorData.error && errorData.error.code === 429) ||
                (errorData.error &&
                    errorData.error.status === 'RESOURCE_EXHAUSTED')
            ) {
                if (retryCount < maxRetries) {
                    const retryDelay = baseDelay * Math.pow(3, retryCount); // Longer delay for rate limits
                    console.log(
                        `Rate limit detectado. Aguardando ${retryDelay}ms antes de tentar novamente...`
                    );
                    await new Promise((resolve) =>
                        setTimeout(resolve, retryDelay)
                    );
                    return await callGemini(prompt, model, retryCount + 1);
                } else {
                    console.error(
                        'Máximo de tentativas atingido para rate limit.'
                    );
                    return null;
                }
            }

            // Handle other errors with retry
            if (retryCount < maxRetries && response.status >= 500) {
                console.log(
                    `Erro ${response.status} detectado. Tentando novamente...`
                );
                return await callGemini(prompt, model, retryCount + 1);
            }

            return null;
        }

        const data = await response.json();

        // Verificação detalhada da resposta da API
        if (!data.candidates || data.candidates.length === 0) {
            console.error(
                'API Error: A resposta não contém "candidates". Pode ter sido bloqueada por segurança.',
                data
            );
            const blockReason = data.promptFeedback?.blockReason;
            if (blockReason) {
                alert(
                    `Geração bloqueada pela API. Motivo: ${blockReason}. Tente alterar o foco ou o conteúdo do artigo.`
                );
            }
            return null;
        }

        if (
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content
        ) {
            return data.candidates[0].content.parts[0].text;
        }

        console.warn(
            'API Warning: Resposta recebida, mas sem o conteúdo esperado. Resposta completa:',
            data
        );
        return null;
    } catch (error) {
        console.error('Erro na chamada da API Gemini:', error);

        // Retry on network errors
        if (
            retryCount < maxRetries &&
            (error.name === 'NetworkError' ||
                error.name === 'TypeError' ||
                error.message.includes('fetch'))
        ) {
            console.log(
                `Erro de rede detectado. Tentando novamente em ${
                    baseDelay * (retryCount + 1)
                }ms...`
            );
            await new Promise((resolve) =>
                setTimeout(resolve, baseDelay * (retryCount + 1))
            );
            return await callGemini(prompt, model, retryCount + 1);
        }

        return null;
    }
}

// --- AI-Powered Content Generation --- //
async function generateSummary(chunk) {
    const summaryOutput = document.getElementById(`summary-${chunk.id}`);
    summaryOutput.innerHTML = '<p>Gerando resumo...</p>';

    const prompt = `
Analise o seguinte texto jurídico e crie um resumo conciso e didático:

TEXTO:
${chunk.text}

INSTRUÇÕES:
- Crie um resumo de 2-3 parágrafos
- Destaque os conceitos jurídicos principais
- Use linguagem clara e objetiva
- Mantenha a precisão técnica
- Foque nos pontos mais importantes para estudo

RESUMO:`;

    try {
        const summary = await callGemini(prompt);
        if (summary) {
            chunk.summary = summary;
            localStorage.setItem('lexia_chunks', JSON.stringify(lexiaChunks));
            summaryOutput.innerHTML = `
                <h5>Resumo:</h5>
                <p>${summary}</p>
            `;
        } else {
            summaryOutput.innerHTML = '<p>Erro ao gerar resumo.</p>';
        }
    } catch (error) {
        console.error('Erro ao gerar resumo:', error);
        summaryOutput.innerHTML = '<p>Erro ao gerar resumo.</p>';
    }
}

async function generateFlashcard(chunk) {
    const flashcardOutput = document.getElementById(`flashcard-${chunk.id}`);
    flashcardOutput.innerHTML = '<p>Gerando flashcard...</p>';

    const prompt = `
Baseado no seguinte texto jurídico, crie um flashcard educativo:

TEXTO:
${chunk.text}

INSTRUÇÕES:
- Crie uma pergunta clara e específica sobre o conteúdo
- A pergunta deve testar compreensão, não memorização
- A resposta deve ser concisa mas completa
- Use terminologia jurídica apropriada
- Foque em conceitos importantes para concursos/estudos

Formato de resposta:
PERGUNTA: [sua pergunta aqui]
RESPOSTA: [sua resposta aqui]`;

    try {
        const flashcardText = await callGemini(prompt);
        if (flashcardText) {
            const lines = flashcardText.split('\n');
            let question = '';
            let answer = '';

            for (const line of lines) {
                if (line.startsWith('PERGUNTA:')) {
                    question = line.replace('PERGUNTA:', '').trim();
                } else if (line.startsWith('RESPOSTA:')) {
                    answer = line.replace('RESPOSTA:', '').trim();
                }
            }

            if (question && answer) {
                const flashcard = SM2Algorithm.createFlashcard(
                    `flashcard-${chunk.id}-${Date.now()}`,
                    question,
                    answer,
                    chunk.id
                );

                lexiaFlashcards.push(flashcard);
                localStorage.setItem(
                    'lexia_flashcards',
                    JSON.stringify(lexiaFlashcards)
                );

                flashcardOutput.innerHTML = `
                    <h5>Flashcard Criado:</h5>
                    <div class="generated-flashcard">
                        <p><strong>Pergunta:</strong> ${question}</p>
                        <p><strong>Resposta:</strong> ${answer}</p>
                    </div>
                `;
                updateDashboard();
            } else {
                flashcardOutput.innerHTML =
                    '<p>Erro: formato de resposta inválido.</p>';
            }
        } else {
            flashcardOutput.innerHTML = '<p>Erro ao gerar flashcard.</p>';
        }
    } catch (error) {
        console.error('Erro ao gerar flashcard:', error);
        flashcardOutput.innerHTML = '<p>Erro ao gerar flashcard.</p>';
    }
}

// --- Chat AI Assistant --- //
// SUBSTITUA A SUA FUNÇÃO 'sendChatMessage' INTEIRA POR ESTA:

async function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const userMessage = chatInput.value.trim();

    if (!userMessage) return;

    addMessageToChat('user', userMessage);
    chatInput.value = '';
    chatInput.style.height = 'auto'; // Reseta a altura do textarea

    const typingIndicator = addMessageToChat('ai', 'Pensando...');

    try {
        // --- INÍCIO DA CORREÇÃO: Verificação de Intenção ---
        if (isStatisticalQuery(userMessage)) {
            // Se for uma pergunta sobre estatísticas, usa o novo processador
            const statResponse = handleStatisticalQuery(userMessage);
            typingIndicator.remove(); // Remove o "Pensando..."
            addMessageToChat('ai', statResponse);

            // Adiciona ao histórico do chat
            chatHistory.push({
                timestamp: new Date(),
                userMessage: userMessage,
                aiResponse: statResponse,
                relevantChunks: [], // Não há chunks de PDF para queries estatísticas
            });
            saveChatHistory();
        } else {
            // Se for uma pergunta de conteúdo, segue o fluxo normal com a IA
            const relevantChunks = await searchSimilarChunks(userMessage, 8);
            const aiResponse = await generateContextualResponse(
                userMessage,
                relevantChunks,
                chatHistory
            );

            typingIndicator.remove();
            addMessageToChat('ai', aiResponse);

            chatHistory.push({
                timestamp: new Date(),
                userMessage: userMessage,
                aiResponse: aiResponse,
                relevantChunks: relevantChunks.map((chunk) => ({
                    file: chunk.file,
                    page: chunk.page,
                    id: chunk.id,
                })),
            });
            saveChatHistory();
        }
        // --- FIM DA CORREÇÃO ---
    } catch (error) {
        console.error('Erro no chat:', error);
        typingIndicator.remove();
        addMessageToChat(
            'ai',
            'Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.'
        );
    }
}

function addMessageToChat(sender, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `${sender}-message`;

    messageDiv.innerHTML = `
        <div class="message-content">
            ${message.replace(/\n/g, '<br>')}
        </div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messageDiv;
}

// SUBSTITUA A SUA FUNÇÃO 'generateContextualResponse' INTEIRA POR ESTA:

async function generateContextualResponse(
    userQuestion,
    relevantChunks,
    history
) {
    if (relevantChunks.length === 0 && history.length === 0) {
        return 'Não encontrei informações relevantes nos materiais fornecidos para responder sua pergunta. Tente reformular ou fazer uma pergunta mais específica sobre o conteúdo dos PDFs jurídicos.';
    }

    const context = relevantChunks
        .map(
            (chunk, index) =>
                `[FONTE ${index + 1}: ${chunk.file}, página ${chunk.page}]\n${
                    chunk.text
                }`
        )
        .join('\n\n');

    // --- INÍCIO DA CORREÇÃO: Construindo o histórico da conversa para o prompt ---
    const recentHistory = history.slice(-4); // Pega as últimas 4 mensagens (2 turnos)
    const historyContext = recentHistory
        .map((entry) => {
            // Limpa a resposta anterior da IA para não incluir a lista de fontes
            const cleanedResponse = (entry.aiResponse || '')
                .split('📚 **Fontes consultadas:**')[0]
                .trim();
            if (entry.userMessage) {
                return `Usuário: ${entry.userMessage}`;
            } else {
                return `Assistente: ${cleanedResponse}`;
            }
        })
        .join('\n');
    // --- FIM DA CORREÇÃO ---

    const prompt = `
Você é um assistente especializado em direito brasileiro. Responda à pergunta ATUAL do usuário, levando em consideração o HISTÓRICO DA CONVERSA para entender o contexto e o CONTEXTO DOS MATERIAIS para encontrar a resposta.

HISTÓRICO DA CONVERSA RECENTE:
${historyContext}

CONTEXTO DOS MATERIAIS (Trechos dos PDFs):
${context}

PERGUNTA ATUAL DO USUÁRIO:
${userQuestion}

INSTRUÇÕES CRÍTICAS:
- Sua resposta DEVE se basear primariamente no CONTEXTO DOS MATERIAIS.
- Use o HISTÓRICO DA CONVERSA para entender perguntas de seguimento (como "dê um exemplo", "e sobre o parágrafo 2?", etc.). A pergunta atual pode se referir ao tópico da mensagem anterior.
- Se a informação para responder à pergunta não estiver no CONTEXTO DOS MATERIAIS, diga claramente: "Não encontrei informações relevantes nos materiais fornecidos para responder sua pergunta." Não invente informações.
- Cite TODAS as fontes específicas (arquivo e página) para cada parte da sua resposta. Ex: (1.direito penal.pdf, pág. 3).
- Se a pergunta atual for um pedido de exemplo para o tópico anterior e não houver um exemplo explícito nos materiais, você PODE criar um exemplo didático simples, desde que ele seja fiel à definição encontrada nos materiais, e cite a fonte da definição.

RESPOSTA:`;

    try {
        const response = await callGemini(prompt);

        if (response) {
            const sources = [
                ...new Set(
                    relevantChunks.map(
                        (chunk) => `${chunk.file} (pág. ${chunk.page})`
                    )
                ),
            ];
            const sourcesText =
                sources.length > 0
                    ? `\n\n📚 **Fontes consultadas:** ${sources.join(', ')}`
                    : '';

            return response + sourcesText;
        } else {
            return 'Desculpe, não consegui processar sua pergunta no momento. Tente novamente.';
        }
    } catch (error) {
        console.error('Erro ao gerar resposta contextual:', error);
        return 'Ocorreu um erro ao processar sua pergunta. Verifique sua conexão e tente novamente.';
    }
}

function calculateSimilarity(query, chunkText) {
    const queryWords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .map((word) => word.replace(/[^\w]/g, '')); // Remove punctuation

    const chunkWords = chunkText
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/[^\w]/g, ''));

    const chunkText_lower = chunkText.toLowerCase();

    let exactMatches = 0;
    let partialMatches = 0;
    let contextMatches = 0;

    for (const word of queryWords) {
        if (word.length < 3) continue;

        // Exact word matches (highest weight)
        if (chunkWords.includes(word)) {
            exactMatches++;
        }
        // Partial matches (medium weight)
        else if (
            chunkWords.some(
                (chunkWord) =>
                    chunkWord.includes(word) || word.includes(chunkWord)
            )
        ) {
            partialMatches++;
        }
        // Context matches - check if word appears in text (lowest weight)
        else if (chunkText_lower.includes(word)) {
            contextMatches++;
        }
    }

    // Weighted scoring system
    const totalScore =
        exactMatches * 3 + partialMatches * 2 + contextMatches * 1;
    const maxPossibleScore = queryWords.length * 3;

    return maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
}

async function searchSimilarChunks(query, limit = 50) {
    if (lexiaChunks.length === 0) return [];

    console.log(`Buscando em ${lexiaChunks.length} chunks disponíveis...`);

    const similarities = lexiaChunks.map((chunk) => ({
        chunk: chunk,
        similarity: calculateSimilarity(query, chunk.text),
    }));

    // Sort by similarity and include more chunks with lower threshold
    const sortedResults = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .filter((item) => item.similarity >= 0); // Include all chunks, even with 0 similarity

    // If we have very few results with good similarity, expand the search
    const goodResults = sortedResults.filter((item) => item.similarity > 0.1);
    const finalLimit =
        goodResults.length < 10 ? Math.min(limit, lexiaChunks.length) : limit;

    const selectedChunks = sortedResults
        .slice(0, finalLimit)
        .map((item) => item.chunk);

    console.log(
        `Encontrados ${selectedChunks.length} chunks relevantes de ${lexiaChunks.length} totais`
    );
    console.log(
        `Fontes consultadas: ${[
            ...new Set(selectedChunks.map((c) => c.file)),
        ].join(', ')}`
    );

    return selectedChunks;
}

// SUBSTITUA TAMBÉM A FUNÇÃO 'loadChatHistory' POR ESTA:

function loadChatHistory() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = ''; // Limpa as mensagens atuais

    // Limpa também o contêiner de sugestões para garantir que ele comece fechado
    const suggestionsContainer = document.getElementById(
        'chat-suggestions-container'
    );
    if (suggestionsContainer) {
        suggestionsContainer.innerHTML = '';
    }

    if (chatHistory.length === 0) {
        // Se não há histórico, mostra apenas a mensagem de boas-vindas
        addMessageToChat(
            'ai',
            'Olá! Sou seu assistente de estudos. Faça perguntas sobre o conteúdo dos PDFs ou clique no ícone 💡 para ver sugestões de perguntas sobre seu progresso.'
        );
    } else {
        // Se há histórico, carrega as mensagens
        const recentHistory = chatHistory.slice(-5); // Pega as últimas 5 para não sobrecarregar
        recentHistory.forEach((entry) => {
            if (entry.userMessage) addMessageToChat('user', entry.userMessage);
            if (entry.aiResponse) addMessageToChat('ai', entry.aiResponse);
        });
    }
}

// --- Advanced Features and Gamification --- //

// Study Goals System
class StudyGoalsManager {
    constructor() {
        this.goals =
            JSON.parse(localStorage.getItem('lexia_study_goals')) || [];
        this.achievements =
            JSON.parse(localStorage.getItem('lexia_achievements')) || [];
    }

    createGoal(type, target, deadline, description) {
        const goal = {
            id: Date.now(),
            type: type, // 'flashcards', 'quiz', 'study_time', 'streak'
            target: target,
            current: 0,
            deadline: new Date(deadline),
            description: description,
            created: new Date(),
            completed: false,
        };

        this.goals.push(goal);
        this.saveGoals();
        return goal;
    }

    updateGoalProgress(type, amount = 1) {
        const activeGoals = this.goals.filter(
            (goal) => !goal.completed && goal.type === type
        );

        activeGoals.forEach((goal) => {
            goal.current += amount;
            if (goal.current >= goal.target) {
                goal.completed = true;
                goal.completedDate = new Date();
                this.unlockAchievement(`goal_${goal.type}_completed`);
            }
        });

        this.saveGoals();
    }

    unlockAchievement(achievementId) {
        if (!this.achievements.includes(achievementId)) {
            this.achievements.push(achievementId);
            this.saveAchievements();
            this.showAchievementNotification(achievementId);
        }
    }

    showAchievementNotification(achievementId) {
        const achievements = {
            goal_flashcards_completed: '🎯 Meta de Flashcards Concluída!',
            goal_quiz_completed: '🧠 Meta de Quiz Concluída!',
            streak_7: '🔥 Sequência de 7 dias!',
            streak_30: '🏆 Sequência de 30 dias!',
            flashcards_100: '💯 100 Flashcards Revisados!',
            quiz_perfect: '⭐ Quiz Perfeito!',
            study_master: '👑 Mestre dos Estudos!',
        };

        const message = achievements[achievementId] || '🎉 Nova Conquista!';

        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <div class="achievement-content">
                <h4>Conquista Desbloqueada!</h4>
                <p>${message}</p>
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    saveGoals() {
        localStorage.setItem('lexia_study_goals', JSON.stringify(this.goals));
    }

    saveAchievements() {
        localStorage.setItem(
            'lexia_achievements',
            JSON.stringify(this.achievements)
        );
    }

    getActiveGoals() {
        return this.goals.filter(
            (goal) => !goal.completed && new Date(goal.deadline) > new Date()
        );
    }

    getCompletedGoals() {
        return this.goals.filter((goal) => goal.completed);
    }
}

// Study Streak System
class StudyStreakManager {
    constructor() {
        this.streakData = JSON.parse(
            localStorage.getItem('lexia_study_streak')
        ) || {
            currentStreak: 0,
            longestStreak: 0,
            lastStudyDate: null,
            studyDates: [],
        };
    }

    recordStudySession() {
        const today = new Date().toISOString().split('T')[0];

        if (!this.streakData.studyDates.includes(today)) {
            this.streakData.studyDates.push(today);

            if (this.streakData.lastStudyDate) {
                const lastDate = new Date(this.streakData.lastStudyDate);
                const todayDate = new Date(today);
                const daysDiff = Math.floor(
                    (todayDate - lastDate) / (1000 * 60 * 60 * 24)
                );

                if (daysDiff === 1) {
                    this.streakData.currentStreak++;
                } else if (daysDiff > 1) {
                    this.streakData.currentStreak = 1;
                }
            } else {
                this.streakData.currentStreak = 1;
            }

            this.streakData.lastStudyDate = today;

            if (this.streakData.currentStreak > this.streakData.longestStreak) {
                this.streakData.longestStreak = this.streakData.currentStreak;
            }

            // Check for streak achievements
            if (this.streakData.currentStreak === 7) {
                studyGoalsManager.unlockAchievement('streak_7');
            } else if (this.streakData.currentStreak === 30) {
                studyGoalsManager.unlockAchievement('streak_30');
            }

            this.saveStreak();
        }
    }

    saveStreak() {
        localStorage.setItem(
            'lexia_study_streak',
            JSON.stringify(this.streakData)
        );
    }

    getCurrentStreak() {
        // Check if streak is still valid (studied yesterday or today)
        const today = new Date();
        const lastStudy = this.streakData.lastStudyDate
            ? new Date(this.streakData.lastStudyDate)
            : null;

        if (lastStudy) {
            const daysDiff = Math.floor(
                (today - lastStudy) / (1000 * 60 * 60 * 24)
            );
            if (daysDiff > 1) {
                this.streakData.currentStreak = 0;
                this.saveStreak();
            }
        }

        return this.streakData.currentStreak;
    }
}

// Advanced Statistics
function generateAdvancedStats() {
    const totalFlashcards = lexiaFlashcards.length;
    const totalQuizzes = quizManager.quizHistory.length;

    // Calcular precisão
    const totalQuestions = quizManager.quizHistory.reduce(
        (sum, quiz) => sum + quiz.questions.length,
        0
    );
    const correctAnswers = quizManager.quizHistory.reduce(
        (sum, quiz) => sum + quiz.score,
        0
    );
    const accuracy =
        totalQuestions > 0
            ? ((correctAnswers / totalQuestions) * 100).toFixed(1)
            : 0;

    // Matéria mais estudada
    const subjectStats = {};
    lexiaFlashcards.forEach((card) => {
        const chunk = lexiaChunks.find((c) => c.id === card.chunkId);
        if (chunk) {
            subjectStats[chunk.file] = (subjectStats[chunk.file] || 0) + 1;
        }
    });

    const mostStudiedSubject = Object.keys(subjectStats).reduce(
        (a, b) => (subjectStats[a] > subjectStats[b] ? a : b),
        'Nenhum'
    );

    return {
        totalFlashcards,
        totalQuizzes,
        accuracy,
        mostStudiedSubject,
        totalQuestions,
        correctAnswers,
    };
}

// Study Session Timer
class StudySessionTimer {
    constructor() {
        this.startTime = null;
        this.isRunning = false;
        this.totalTime = 0;
    }

    start() {
        if (!this.isRunning) {
            this.startTime = Date.now();
            this.isRunning = true;
        }
    }

    stop() {
        if (this.isRunning) {
            this.totalTime += Date.now() - this.startTime;
            this.isRunning = false;

            // Record study session
            studyStreakManager.recordStudySession();

            // Update daily progress
            const today = new Date().toISOString().split('T')[0];
            if (!lexiaProgress[today]) {
                lexiaProgress[today] = {
                    flashcardsReviewed: 0,
                    quizzesCompleted: 0,
                    timeStudied: 0,
                };
            }
            lexiaProgress[today].timeStudied += Math.floor(
                this.totalTime / 1000 / 60
            ); // minutes
            localStorage.setItem(
                'lexia_progress',
                JSON.stringify(lexiaProgress)
            );

            this.totalTime = 0;
        }
    }

    getElapsedTime() {
        if (this.isRunning) {
            return this.totalTime + (Date.now() - this.startTime);
        }
        return this.totalTime;
    }
}

// Agora inicializamos as instâncias
let studyGoalsManager = new StudyGoalsManager();
let studyStreakManager = new StudyStreakManager();
let studyTimer = new StudySessionTimer();

// ADICIONAR ESTA FUNÇÃO NOVA:
function getTotalQuizTime() {
    let totalTime = 0;
    quizManager.quizHistory.forEach((quiz) => {
        if (quiz.startTime && quiz.endTime) {
            const start = new Date(quiz.startTime);
            const end = new Date(quiz.endTime);
            totalTime += end - start; // tempo em milissegundos
        }
    });
    // Converter para minutos
    return Math.floor(totalTime / 1000 / 60);
}

// Enhanced Dashboard with Advanced Features
function renderAdvancedDashboard() {
    const stats = generateAdvancedStats();
    const totalQuizTime = getTotalQuizTime();

    const dashboardSection = document.getElementById('dashboard');
    dashboardSection.innerHTML = `
        <div class="advanced-dashboard">
            <h2>Dashboard</h2>
            
            <div class="dashboard-grid">
                <div class="stats-section">
                    <h3>Estatísticas Gerais</h3>
                    <div class="stats-cards">
                        <div class="stat-card">
                            <div class="stat-icon">🃏</div>
                            <div class="stat-info">
                                <h4>${stats.totalFlashcards}</h4>
                                <p>Flashcards Criados</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🧠</div>
                            <div class="stat-info">
                                <h4>${stats.totalQuizzes}</h4>
                                <p>Quizzes Realizados</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🎯</div>
                            <div class="stat-info">
                                <h4>${stats.accuracy}%</h4>
                                <p>Precisão Geral</p>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">⏱️</div>
                            <div class="stat-info">
                                <h4>${totalQuizTime}min</h4>
                                <p>Tempo de Estudo</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderStreakCalendar() {
    const today = new Date();
    const last7Days = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const hasStudied =
            studyStreakManager.streakData.studyDates.includes(dateStr);

        last7Days.push(`
            <div class="calendar-day ${hasStudied ? 'studied' : ''}">
                <span class="day-number">${date.getDate()}</span>
            </div>
        `);
    }

    return last7Days.join('');
}

function renderAchievements(achievements) {
    const allAchievements = {
        goal_flashcards_completed: { icon: '🎯', name: 'Meta de Flashcards' },
        goal_quiz_completed: { icon: '🧠', name: 'Meta de Quiz' },
        streak_7: { icon: '🔥', name: 'Sequência de 7 dias' },
        streak_30: { icon: '🏆', name: 'Sequência de 30 dias' },
        flashcards_100: { icon: '💯', name: '100 Flashcards' },
        quiz_perfect: { icon: '⭐', name: 'Quiz Perfeito' },
        study_master: { icon: '👑', name: 'Mestre dos Estudos' },
    };

    return Object.keys(allAchievements)
        .map((id) => {
            const achievement = allAchievements[id];
            const unlocked = achievements.includes(id);

            return `
            <div class="achievement-badge ${unlocked ? 'unlocked' : 'locked'}">
                <div class="achievement-icon">${
                    unlocked ? achievement.icon : '🔒'
                }</div>
                <div class="achievement-name">${achievement.name}</div>
            </div>
        `;
        })
        .join('');
}

function showDetailedStatsModal() {
    const stats = generateAdvancedStats();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content detailed-stats-modal">
            <h3>📊 Estatísticas Detalhadas</h3>
            <div class="detailed-stats-grid">
                <div class="stats-category">
                    <h4>📚 Estudo Geral</h4>
                    <div class="stat-row">
                        <span>Total de Flashcards:</span>
                        <strong>${stats.totalFlashcards}</strong>
                    </div>
                    <div class="stat-row">
                        <span>Quizzes Realizados:</span>
                        <strong>${stats.totalQuizzes}</strong>
                    </div>
                    <div class="stat-row">
                        <span>Tempo Total de Estudo:</span>
                        <strong>${Math.floor(stats.totalStudyTime / 60)}h ${
        stats.totalStudyTime % 60
    }min</strong>
                    </div>
                    <div class="stat-row">
                        <span>Matéria Mais Estudada:</span>
                        <strong>${stats.mostStudiedSubject}</strong>
                    </div>
                </div>
                
                <div class="stats-category">
                    <h4>🎯 Performance</h4>
                    <div class="stat-row">
                        <span>Precisão Geral:</span>
                        <strong>${stats.accuracy}%</strong>
                    </div>
                    <div class="stat-row">
                        <span>Total de Questões:</span>
                        <strong>${stats.totalQuestions}</strong>
                    </div>
                    <div class="stat-row">
                        <span>Respostas Corretas:</span>
                        <strong>${stats.correctAnswers}</strong>
                    </div>
                    <div class="stat-row">
                        <span>Taxa de Acerto:</span>
                        <strong>${
                            stats.totalQuestions > 0
                                ? (
                                      (stats.correctAnswers /
                                          stats.totalQuestions) *
                                      100
                                  ).toFixed(1)
                                : 0
                        }%</strong>
                    </div>
                </div>
                
                <div class="stats-category">
                    <h4>🔥 Sequências</h4>
                    <div class="stat-row">
                        <span>Sequência Atual:</span>
                        <strong>${stats.currentStreak} dias</strong>
                    </div>
                    <div class="stat-row">
                        <span>Melhor Sequência:</span>
                        <strong>${stats.longestStreak} dias</strong>
                    </div>
                    <div class="stat-row">
                        <span>Dias Estudados:</span>
                        <strong>${
                            studyStreakManager.streakData.studyDates.length
                        }</strong>
                    </div>
                </div>
                
                <div class="stats-category">
                    <h4>🏆 Conquistas</h4>
                    <div class="stat-row">
                        <span>Conquistas Desbloqueadas:</span>
                        <strong>${
                            studyGoalsManager.achievements.length
                        }/7</strong>
                    </div>
                    <div class="stat-row">
                        <span>Metas Concluídas:</span>
                        <strong>${
                            studyGoalsManager.getCompletedGoals().length
                        }</strong>
                    </div>
                    <div class="stat-row">
                        <span>Metas Ativas:</span>
                        <strong>${
                            studyGoalsManager.getActiveGoals().length
                        }</strong>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" id="close-stats-modal">Fechar</button>
                <button class="btn-primary" id="export-stats">Exportar Estatísticas</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document
        .getElementById('close-stats-modal')
        .addEventListener('click', () => {
            document.body.removeChild(modal);
        });

    document.getElementById('export-stats').addEventListener('click', () => {
        const statsData = {
            timestamp: new Date().toISOString(),
            stats: stats,
            goals: studyGoalsManager.goals,
            achievements: studyGoalsManager.achievements,
            streakData: studyStreakManager.streakData,
            progress: lexiaProgress,
        };

        const blob = new Blob([JSON.stringify(statsData, null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lexia_statistics_${
            new Date().toISOString().split('T')[0]
        }.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

function showCreateGoalModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Criar Nova Meta</h3>
            <form id="goal-form">
                <div class="form-group">
                    <label for="goal-type">Tipo de Meta:</label>
                    <select id="goal-type" required>
                        <option value="flashcards">Revisar Flashcards</option>
                        <option value="quiz">Fazer Quizzes</option>
                        <option value="study_time">Tempo de Estudo (minutos)</option>
                        <option value="streak">Manter Sequência (dias)</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="goal-target">Meta (número):</label>
                    <input type="number" id="goal-target" min="1" required>
                </div>
                <div class="form-group">
                    <label for="goal-deadline">Prazo:</label>
                    <input type="date" id="goal-deadline" required>
                </div>
                <div class="form-group">
                    <label for="goal-description">Descrição:</label>
                    <input type="text" id="goal-description" placeholder="Ex: Revisar 50 flashcards esta semana" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn-primary">Criar Meta</button>
                    <button type="button" class="btn-secondary" id="cancel-goal">Cancelar</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('goal-form').addEventListener('submit', (e) => {
        e.preventDefault();

        const type = document.getElementById('goal-type').value;
        const target = parseInt(document.getElementById('goal-target').value);
        const deadline = document.getElementById('goal-deadline').value;
        const description = document.getElementById('goal-description').value;

        studyGoalsManager.createGoal(type, target, deadline, description);
        document.body.removeChild(modal);
        renderAdvancedDashboard();
    });

    document.getElementById('cancel-goal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// Update existing functions to use advanced features
const originalUpdateDashboard = updateDashboard;
updateDashboard = function () {
    renderAdvancedDashboard();
};

// Hook into existing review functions to update goals
function enhancedFlashcardReview(cardsToReview, reviewType) {
    startFlashcardReview(cardsToReview, reviewType);
    studyGoalsManager.updateGoalProgress('flashcards', cardsToReview.length);
}

// Auto-save study session when user leaves
window.addEventListener('beforeunload', () => {
    studyTimer.stop();
});
