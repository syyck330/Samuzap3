const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Define diretório temporário para arquivos de mídia
const tempDir = path.join(os.tmpdir(), 'medeiros-chatbot');

// Garantir que o diretório de logs existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Garante que o diretório temporário existe
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Registra fluxo de mensagens para depuração
 * @param {string} tipo - Tipo de mensagem (RECEBIDA, ENVIADA, SISTEMA, ERRO)
 * @param {string} chatId - ID do chat
 * @param {string} conteudo - Conteúdo da mensagem
 */
function logMessageFlow(tipo, chatId, conteudo) {
  try {
    const now = new Date();
    const timestamp = now.toISOString();
    const date = now.toISOString().split('T')[0];
    
    // Formata o chatId para uso em nome de arquivo
    const safeId = chatId.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Caminho do arquivo de log para este chat e data
    const logFilePath = path.join(logsDir, `${date}_${safeId}.log`);
    
    // Prepara a linha de log
    const conteudoResumido = conteudo.substring(0, 150) + (conteudo.length > 150 ? '...' : '');
    const logLine = `[${timestamp}] [${tipo}] ${chatId}: ${conteudoResumido}\n`;
    
    // Escreve no arquivo
    fs.appendFileSync(logFilePath, logLine);
    
    // Escreve também em um arquivo de log geral para todos os chats
    const generalLogPath = path.join(logsDir, `${date}_all.log`);
    fs.appendFileSync(generalLogPath, logLine);
    
    // Console também para depuração imediata
    if (tipo === 'ERRO') {
      console.error(`📝 [${tipo}] ${chatId}: ${conteudoResumido}`);
    } else if (tipo === 'RECEBIDA') {
      console.log(`📥 [${tipo}] ${chatId}: ${conteudoResumido}`);
    } else if (tipo === 'ENVIADA') {
      console.log(`📤 [${tipo}] ${chatId}: ${conteudoResumido}`);
    } else {
      console.log(`🔄 [${tipo}] ${chatId}: ${conteudoResumido}`);
    }
  } catch (error) {
    console.error('❌ Erro ao registrar log:', error);
  }
}

/**
 * Gera um nome de arquivo único para mídia
 * @param {string} mimetype - Tipo MIME do arquivo
 * @returns {string} - Nome de arquivo único
 */
function generateUniqueFilename(mimetype) {
  const hash = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  const extension = getExtensionFromMimeType(mimetype);
  return `media_${timestamp}_${hash}.${extension}`;
}

/**
 * Obtém a extensão de arquivo a partir do tipo MIME
 * @param {string} mimetype - Tipo MIME
 * @returns {string} - Extensão de arquivo
 */
function getExtensionFromMimeType(mimetype) {
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf'
  };

  return mimeToExt[mimetype] || 'bin';
}

/**
 * Limpa arquivos temporários mais antigos que o limite especificado
 * @param {number} maxAgeMs - Idade máxima em milissegundos (padrão: 24 horas)
 */
function cleanupTempFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    if (!fs.existsSync(tempDir)) return;

    const now = Date.now();
    const files = fs.readdirSync(tempDir);

    let removedCount = 0;
    for (const file of files) {
      try {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);

        // Verifica se o arquivo é mais antigo que o limite
        if (now - stats.mtime.getTime() > maxAgeMs) {
          fs.unlinkSync(filePath);
          removedCount++;
        }
      } catch (error) {
        console.error(`❌ Erro ao processar arquivo ${file}:`, error);
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 ${removedCount} arquivos temporários removidos`);
    }
  } catch (error) {
    console.error('❌ Erro ao limpar arquivos temporários:', error);
  }
}

/**
 * Verifica se um tempo de inatividade foi alcançado
 * @param {number} lastActivity - Timestamp da última atividade
 * @param {number} inactiveMinutes - Minutos de inatividade para verificar
 * @returns {boolean} - True se o tempo de inatividade foi atingido
 */
function checkInactivityTimeout(lastActivity, inactiveMinutes = 30) {
  if (!lastActivity) return false;
  
  const now = Date.now();
  const inactiveTimeMs = inactiveMinutes * 60 * 1000; // Converter minutos para ms
  const result = (now - lastActivity) >= inactiveTimeMs;
  
  if (result) {
    const minutesInactive = Math.floor((now - lastActivity) / 60000);
    console.log(`⏱️ Detectada inatividade de ${minutesInactive} minutos (limite: ${inactiveMinutes} minutos)`);
  }
  
  return result;
}

/**
 * Registra estatísticas gerais do bot
 */
function logBotStats() {
  try {
    const now = new Date();
    const timestamp = now.toISOString();
    const statsFilePath = path.join(logsDir, 'bot_stats.json');
    
    // Carrega estatísticas anteriores se existirem
    let stats = {};
    if (fs.existsSync(statsFilePath)) {
      stats = JSON.parse(fs.readFileSync(statsFilePath, 'utf8'));
    }
    
    // Atualiza estatísticas
    stats.lastActive = timestamp;
    stats.uptime = stats.startTime ? (new Date() - new Date(stats.startTime)) / 1000 : 0;
    if (!stats.startTime) stats.startTime = timestamp;
    stats.totalRuns = (stats.totalRuns || 0) + 1;
    
    // Salva estatísticas
    fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2));
    console.log(`📊 Estatísticas do bot atualizadas: Execução #${stats.totalRuns}, Uptime: ${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`);
  } catch (error) {
    console.error('❌ Erro ao registrar estatísticas:', error);
  }
}

// Exporta as funções
module.exports = {
  tempDir,
  generateUniqueFilename,
  getExtensionFromMimeType,
  cleanupTempFiles,
  checkInactivityTimeout,
  logMessageFlow,
  logBotStats
};
