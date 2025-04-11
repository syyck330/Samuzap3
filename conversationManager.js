const fs = require('fs');
const path = require('path');
const { logMessageFlow } = require('./utils');

// Diretório para armazenar os históricos de conversas
const conversationsDir = path.join(__dirname, 'conversations');

// Garantir que o diretório de conversas existe
if (!fs.existsSync(conversationsDir)) {
  fs.mkdirSync(conversationsDir, { recursive: true });
}

// Objeto para armazenar conversas em memória (para acesso rápido)
const conversations = {};

// Função para obter o caminho do arquivo de uma conversa
const getConversationFilePath = (chatId) => {
  return path.join(conversationsDir, `${chatId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
};

// Carregar histórico de conversa
const loadConversation = (chatId) => {
  // Se já estiver em memória, retorna o que está em memória
  if (conversations[chatId]) {
    return conversations[chatId];
  }

  const filePath = getConversationFilePath(chatId);

  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      conversations[chatId] = JSON.parse(data);
      console.log(`📚 Conversa ${chatId} carregada do arquivo`);
      return conversations[chatId];
    }
  } catch (error) {
    console.error(`❌ Erro ao carregar conversa ${chatId}:`, error);
  }

  // Se não existir ou ocorrer erro, inicia uma nova conversa
  conversations[chatId] = {
    messages: [],
    userInfo: {},
    lastUpdated: Date.now(),
    status: 'em_espera', // Status do atendimento
    lastStatusChange: Date.now(), // Novo campo para rastrear quando o status mudou
    protocolo: null // Número de protocolo
  };

  console.log(`🆕 Nova conversa iniciada para ${chatId}`);
  return conversations[chatId];
};

// Salvar histórico de conversa
const saveConversation = (chatId, conversation) => {
  try {
    const filePath = getConversationFilePath(chatId);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf8');
    console.log(`💾 Conversa ${chatId} salva com sucesso`);
  } catch (error) {
    console.error(`❌ Erro ao salvar conversa ${chatId}:`, error);
  }
};

// Adicionar mensagem ao histórico
const addMessage = (chatId, role, content) => {
  const conversation = loadConversation(chatId);

  // Limitar o tamanho do histórico (manter últimas 20 mensagens)
  if (conversation.messages.length >= 20) {
    conversation.messages = conversation.messages.slice(-19);
  }

  // Adicionar nova mensagem
  conversation.messages.push({
    role,
    content,
    timestamp: Date.now()
  });

  conversation.lastUpdated = Date.now();

  // Log para debug
  console.log(`📝 Mensagem adicionada - De: ${role}, Para: ${chatId}, Conteúdo: ${content.substring(0, 50)}...`);

  // Atualizar em memória e persistir no arquivo
  conversations[chatId] = conversation;
  saveConversation(chatId, conversation);

  return conversation;
};

// Extrair e armazenar informações do usuário mencionadas na conversa
const updateUserInfo = (chatId, key, value) => {
  const conversation = loadConversation(chatId);
  const oldValue = conversation.userInfo[key];
  conversation.userInfo[key] = value;
  conversations[chatId] = conversation;
  saveConversation(chatId, conversation);
  
  console.log(`📊 Informação do usuário ${chatId} atualizada - ${key}: ${oldValue} → ${value}`);
  return conversation;
};

// Obter histórico formatado para envio ao Gemini
const getFormattedHistory = (chatId, maxTokens = 2000) => {
  const conversation = loadConversation(chatId);

  // Preparar histórico formatado com um limite aproximado de tokens
  let formattedHistory = '';
  let estimatedTokens = 0;

  // Começar do final para pegar as mensagens mais recentes
  const reversedMessages = [...conversation.messages].reverse();

  for (const msg of reversedMessages) {
    const messageText = `${msg.role}: ${msg.content}\n\n`;
    const estimatedMsgTokens = messageText.length / 4; // Estimativa aproximada

    if (estimatedTokens + estimatedMsgTokens > maxTokens) {
      break;
    }

    formattedHistory = messageText + formattedHistory;
    estimatedTokens += estimatedMsgTokens;
  }

  return formattedHistory;
};

// Verificar se um usuário é novo ou recorrente
const isNewUser = (chatId) => {
  const conversation = loadConversation(chatId);
  const isNew = conversation.messages.length === 0;
  if (isNew) {
    console.log(`🆕 Usuário ${chatId} identificado como NOVO`);
  } else {
    console.log(`🔄 Usuário ${chatId} identificado como RECORRENTE com ${conversation.messages.length} mensagens`);
  }
  return isNew;
};

// Verificar se um usuário está em atendimento humano
const isInHumanSupport = (chatId) => {
  const conversation = loadConversation(chatId);
  const result = conversation.status === 'em_atendimento';
  if (result) {
    console.log(`👨‍💼 Usuário ${chatId} está em ATENDIMENTO HUMANO`);
  }
  return result;
};

// Atualizar o status de atendimento do cliente
const updateClientStatus = (chatId, status) => {
  const conversation = loadConversation(chatId);
  const oldStatus = conversation.status;
  conversation.status = status;
  
  // Registrar timestamp da mudança de status
  conversation.lastStatusChange = Date.now();
  
  conversations[chatId] = conversation;
  saveConversation(chatId, conversation);
  console.log(`🔄 Status do cliente ${chatId} atualizado: ${oldStatus} → ${status}`);
  return conversation;
};

// Verificar se uma conversa em atendimento humano está inativa por determinado tempo
const checkInactiveHumanSupport = (chatId, inactiveTimeMs = 3600000) => { // Padrão: 1 hora (3600000 ms)
  const conversation = loadConversation(chatId);
  
  // Se não estiver em atendimento humano, retorna falso
  if (conversation.status !== 'em_atendimento') {
    return false;
  }
  
  const currentTime = Date.now();
  const lastUpdate = conversation.lastUpdated || 0;
  const timeSinceLastUpdate = currentTime - lastUpdate;
  
  // Se o tempo desde a última atualização for maior que o tempo de inatividade definido
  if (timeSinceLastUpdate >= inactiveTimeMs) {
    console.log(`⏱️ Cliente ${chatId} inativo por ${Math.floor(timeSinceLastUpdate/60000)} minutos no atendimento humano`);
    return true;
  }
  
  return false;
};

// Retornar cliente para atendimento automatizado após período de inatividade
const returnToAutomatedSupport = (chatId) => {
  const conversation = loadConversation(chatId);
  
  // Apenas altera o status se estiver em atendimento humano
  if (conversation.status === 'em_atendimento') {
    conversation.status = 'em_espera';
    conversation.lastStatusChange = Date.now();
    
    // Adiciona uma mensagem ao histórico
    const systemMessage = 'Cliente retornado ao atendimento automatizado devido à inatividade.';
    conversation.messages.push({
      role: 'system',
      content: systemMessage,
      timestamp: Date.now()
    });
    
    conversation.lastUpdated = Date.now();
    
    // Atualiza em memória e salva no arquivo
    conversations[chatId] = conversation;
    saveConversation(chatId, conversation);
    
    console.log(`🔄 Cliente ${chatId} retornado ao atendimento automatizado por inatividade`);
    logMessageFlow('SISTEMA', chatId, systemMessage);
    return true;
  }
  
  return false;
};

// Verificar todas as conversas para inatividade e retornar ao atendimento automatizado
const checkAllConversationsForInactivity = (inactiveTimeMs = 3600000) => { // Padrão: 1 hora
  console.log(`🕒 Verificando inatividade em todas as conversas (limite: ${Math.floor(inactiveTimeMs/60000)} minutos)`);
  const allConversations = getAllConversations();
  const returnedClients = [];
  
  for (const chatId in allConversations) {
    if (checkInactiveHumanSupport(chatId, inactiveTimeMs)) {
      const returned = returnToAutomatedSupport(chatId);
      if (returned) {
        returnedClients.push(chatId);
      }
    }
  }
  
  if (returnedClients.length > 0) {
    console.log(`✅ ${returnedClients.length} clientes retornados ao atendimento automatizado`);
  } else {
    console.log(`✅ Nenhum cliente inativo encontrado`);
  }
  
  return returnedClients;
};

// Remover uma conversa do sistema
const deleteConversation = (chatId) => {
  try {
    const filePath = getConversationFilePath(chatId);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Conversa ${chatId} excluída com sucesso`);
    }

    // Remover da memória também
    if (conversations[chatId]) {
      delete conversations[chatId];
    }

    return true;
  } catch (error) {
    console.error(`❌ Erro ao excluir conversa ${chatId}:`, error);
    return false;
  }
};

// Obter todas as conversas salvas
const getAllConversations = () => {
  try {
    // Ler todos os arquivos de conversa do diretório
    const files = fs.readdirSync(conversationsDir);
    const allConversations = {};

    files.forEach(file => {
      if (file.endsWith('.json')) {
        const chatId = file.replace('.json', '');
        const filePath = path.join(conversationsDir, file);
        const data = fs.readFileSync(filePath, 'utf8');
        allConversations[chatId] = JSON.parse(data);
      }
    });

    console.log(`📊 ${Object.keys(allConversations).length} conversas encontradas no sistema`);
    return allConversations;
  } catch (error) {
    console.error('❌ Erro ao obter todas as conversas:', error);
    return {};
  }
};

// Exporta as funções
module.exports = {
  addMessage,
  getFormattedHistory,
  updateUserInfo,
  loadConversation,
  saveConversation,
  isNewUser,
  deleteConversation,
  getAllConversations,
  isInHumanSupport,
  updateClientStatus,
  checkInactiveHumanSupport,
  returnToAutomatedSupport,
  checkAllConversationsForInactivity
};
