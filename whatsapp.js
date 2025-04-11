const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const {
  generateWelcomeMessage,
  analyzeImageWithGemini,
  processNovidades,
  checkHumanSupportTimeout,
  transferirParaAtendenteHumano,
  processarPedido,
  notificarDonoDaLoja,
  processarSubmenuNovidades,
  isInNovidadesSubmenu,
  processNovidadesSubmenu
} = require('./medeirosbot');
const {
  loadConversation,
  checkAllConversationsForInactivity,
  updateUserInfo,
  isInHumanSupport,
  updateClientStatus,
  addMessage,
  isNewUser
} = require('./conversationManager');
const {
  cleanupTempFiles,
  generateUniqueFilename,
  tempDir,
  logMessageFlow
} = require('./utils');

// Diretório temporário para salvar arquivos de mídia
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configuração do cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

// Exibe o código QR no terminal para autenticação
client.on('qr', (qr) => {
  console.log('QR Code recebido. Escaneie com seu WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Cliente WhatsApp está pronto e conectado!');
  console.log('Bot está ativo e aguardando mensagens...');
  
  // Inicia a verificação periódica de conversas inativas (a cada 10 minutos)
  console.log('🕒 Iniciando verificação periódica de conversas inativas...');
  setInterval(() => {
    checkAllConversationsForInactivity(30 * 60 * 1000); // 30 minutos
  }, 10 * 60 * 1000); // 10 minutos
});

// Funções auxiliares para autenticação
client.on('authenticated', () => {
  console.log('✅ Autenticação bem-sucedida! A sessão foi salva.');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
  console.log('❌ Cliente desconectado:', reason);
});

// Função para salvar mídia recebida temporariamente
async function saveMediaToTemp(message) {
  if (!message.hasMedia) {
    console.log('Mensagem não tem mídia para salvar.');
    return null;
  }

  try {
    const media = await message.downloadMedia();
    if (!media) {
      console.log('Download de mídia falhou.');
      return null;
    }

    const extension = media.mimetype.split('/')[1];
    const filename = generateUniqueFilename(extension);
    const filePath = path.join(tempDir, filename);

    fs.writeFileSync(filePath, media.data, 'base64');
    console.log(`Arquivo de mídia salvo em: ${filePath}`);

    return {
      filePath: filePath,
      mimeType: media.mimetype,
      filename: filename
    };
  } catch (error) {
    console.error('Erro ao salvar mídia:', error);
    return null;
  }
}

// Variável para rastrear mensagens processadas para evitar duplicação
const processedMessages = new Set();

// Manipulador de mensagens recebidas
client.on('message', async (message) => {
  try {
    // Verifica se a mensagem já foi processada (evita duplicação)
    const messageId = message.id._serialized;
    if (processedMessages.has(messageId)) {
      console.log(`⏭️ Mensagem ${messageId} já foi processada, ignorando`);
      return;
    }
    
    // Marca a mensagem como processada
    processedMessages.add(messageId);
    
    // Limita o tamanho do cache de mensagens processadas
    if (processedMessages.size > 100) {
      const iterator = processedMessages.values();
      processedMessages.delete(iterator.next().value);
    }
    
    // Log do início de processamento
    console.log('-----------------------------------------');
    console.log(`📩 Nova mensagem de: ${message.from} (${message.author || 'direto'})`);
    logMessageFlow('RECEBIDA', message.from, message.body);
    
    // Ignora mensagens de status (broadcasts) ou grupos
    if (message.from === 'status@broadcast') {
      console.log('⏩ Ignorando mensagem de status');
      return;
    }
    
    // BLOQUEIO ROBUSTO PARA GRUPOS - Não responde em nenhum caso
    if (message.from.includes('-') || message.author) {
      console.log('⏩ Ignorando mensagem de grupo - o bot não responde em grupos');
      return;
    }
    
    // Carrega informações do chat para identificar o nome do contato
    let clientName = 'cliente';
    try {
      const chat = await message.getChat();
      clientName = chat.name || 'cliente';
    } catch (error) {
      console.error('❌ Erro ao obter informações do chat:', error);
    }
    
    // Atualiza o nome do cliente no gerenciador de conversas
    updateUserInfo(message.from, 'name', clientName);
    
    // Adiciona mensagem ao histórico
    addMessage(message.from, 'user', message.body);
    
    // Verifica se o cliente está inativo no atendimento humano por mais de 30 minutos
    if (checkHumanSupportTimeout(message.from)) {
      console.log(`⏱️ Cliente ${message.from} inativo no atendimento humano por mais de 30 minutos, retornando ao atendimento automático`);
      updateClientStatus(message.from, 'em_espera');
      
      // Envia mensagem de boas-vindas novamente
      const welcomeMessage = await generateWelcomeMessage(clientName);
      await message.reply(welcomeMessage);
      addMessage(message.from, 'assistant', welcomeMessage);
      logMessageFlow('ENVIADA', message.from, welcomeMessage);
      return;
    }
    
    // Se o cliente estiver em atendimento humano, não processa a mensagem
    if (isInHumanSupport(message.from)) {
      console.log(`👨‍💼 Cliente ${message.from} está em atendimento humano, bot não responderá`);
      return;
    }

    // Carrega a conversa para verificar se o cliente está esperando enviar uma imagem
    const conversation = loadConversation(message.from);
    
    // Verifica se o cliente está no fluxo de pedido
    if (conversation.userInfo.orderStep) {
      console.log(`🛒 Cliente ${message.from} está no fluxo de pedido, etapa: ${conversation.userInfo.orderStep}`);
      await processarPedido(message.from, 
        async (text) => {
          try {
            console.log(`📤 Enviando resposta do pedido para ${message.from}: ${text.substring(0, 100)}...`);
            await message.reply(text);
            addMessage(message.from, 'assistant', text);
            logMessageFlow('ENVIADA', message.from, text);
          } catch (e) {
            console.error('❌ Erro ao responder pedido:', e);
          }
        }, 
        message.body
      );
      return;
    }
    
    // Verifica se o cliente está no submenu de novidades 
    // e processa as opções 1 (falar com atendente) e 0 (voltar ao menu)
    const messageText = message.body.trim();
    
    // IMPORTANTE: Primeiro verifica se está no submenu de novidades
    if (isInNovidadesSubmenu(message.from)) {
      console.log(`🔍 Cliente ${message.from} está no submenu de novidades, processando opção: ${messageText}`);
      
      // Tenta processar a mensagem como resposta do submenu de novidades
      const processado = await processarSubmenuNovidades(message.from, messageText, 
        async (text) => {
          try {
            console.log(`📤 Enviando resposta de submenu para ${message.from}: ${text.substring(0, 100)}...`);
            await message.reply(text);
            addMessage(message.from, 'assistant', text);
            logMessageFlow('ENVIADA', message.from, text);
          } catch (e) {
            console.error('❌ Erro ao responder no submenu:', e);
          }
        }
      );
      
      // Se a mensagem foi processada pelo submenu, não continuar o processamento
      if (processado) {
        console.log(`✅ Mensagem processada no contexto do submenu para ${message.from}`);
        return;
      }
    }
    
    // Envia o menu inicial APENAS para usuários novos ou com poucas mensagens
    const isFirstInteraction = isNewUser(message.from) || conversation.messages.length <= 2;
    
    if (isFirstInteraction && !message.hasMedia) {
      const welcomeMessage = await generateWelcomeMessage(clientName);
      console.log(`🤖 Enviando menu inicial para novo usuário ${message.from}`);
      await message.reply(welcomeMessage);
      addMessage(message.from, 'assistant', welcomeMessage);
      logMessageFlow('ENVIADA', message.from, welcomeMessage);
      return;
    }
    
    // Processamento de diferentes opções do menu principal
    
    // Opção 2 - Enviar foto do tênis
    if (messageText === '2' || messageText.toLowerCase().includes('enviar foto')) {
      console.log(`🤖 Cliente ${message.from} solicitou opção 2: Enviar foto do tênis`);
      updateUserInfo(message.from, 'waitingForImage', true);
      const response = "Por favor, envie a foto do tênis que deseja identificar.";
      await message.reply(response);
      addMessage(message.from, 'assistant', response);
      logMessageFlow('ENVIADA', message.from, response);
      return;
    }
    
    // Verifica se o cliente está esperando enviar uma imagem
    if ((conversation.userInfo.waitingForImage || messageText === '2') && message.hasMedia) {
      try {
        console.log(`🤖 Processando imagem do cliente ${message.from}`);
        const mediaInfo = await saveMediaToTemp(message);
        
        if (!mediaInfo) {
          const errorMsg = "Desculpe, não consegui processar essa mídia. Pode tentar de outra forma?";
          await message.reply(errorMsg);
          addMessage(message.from, 'assistant', errorMsg);
          logMessageFlow('ENVIADA', message.from, errorMsg);
          return;
        }
        
        // Limpa o flag de espera por imagem
        updateUserInfo(message.from, 'waitingForImage', false);
        
        // Analisa a imagem e obtém resultado
        console.log(`🔍 Analisando imagem do cliente ${message.from}`);
        const result = await analyzeImageWithGemini(mediaInfo.filePath, message.from, 
          async (text) => {
            if (text) {
              try {
                console.log(`📤 Enviando resposta de análise para ${message.from}: ${text.substring(0, 100)}...`);
                await message.reply(text);
                addMessage(message.from, 'assistant', text);
                logMessageFlow('ENVIADA', message.from, text);
              } catch (e) {
                console.error('❌ Erro ao responder análise de imagem:', e);
              }
            }
          });
        
        // Após a identificação do produto, transfere para atendente humano
        console.log(`🔄 Transferindo cliente ${message.from} para atendente humano após análise de imagem`);
        await transferirParaAtendenteHumano(message.from, 
          async (text) => {
            try {
              console.log(`📤 Enviando mensagem de transferência para ${message.from}: ${text.substring(0, 100)}...`);
              await message.reply(text);
              addMessage(message.from, 'assistant', text);
              logMessageFlow('ENVIADA', message.from, text);
            } catch (e) {
              console.error('❌ Erro ao responder transferência:', e);
            }
          });
        
      } catch (error) {
        console.error('❌ Erro ao processar imagem:', error);
        const errorMsg = "Ocorreu um erro ao processar a imagem. Por favor, tente novamente.";
        await message.reply(errorMsg);
        addMessage(message.from, 'assistant', errorMsg);
        logMessageFlow('ENVIADA', message.from, errorMsg);
      }
      return;
    }
    
    // Opção 1 - Ver Novidades
    if (messageText === '1' || messageText.toLowerCase().includes('ver novidade')) {
      console.log(`🤖 Cliente ${message.from} solicitou opção 1: Ver Novidades`);
      console.log(`🏬 Processando opção Ver Novidades para chatId: ${message.from}`);
      const response = "Confira os lançamentos da Medeiros Calçados! Temos diversas novidades para você. Vou apresentar cada produto individualmente.";
      await message.reply(response);
      addMessage(message.from, 'assistant', response);
      logMessageFlow('ENVIADA', message.from, response);
      
      await processNovidades(message.from, 
        async (messageContent) => {
          try {
            console.log(`📤 Enviando novidade para ${message.from}`);
            if (typeof messageContent === 'string') {
              await client.sendMessage(message.from, messageContent);
              addMessage(message.from, 'assistant', messageContent);
              logMessageFlow('ENVIADA', message.from, messageContent);
            } else if (messageContent instanceof MessageMedia) {
              await client.sendMessage(message.from, messageContent);
              console.log(`📤 Enviando imagem para ${message.from}`);
            }
          } catch (e) {
            console.error('❌ Erro ao enviar novidade:', e);
          }
        }
      );
      
      // Define o estado atual do usuário como 'novidades_submenu'
      updateUserInfo(message.from, 'currentState', 'novidades_submenu');
      logMessageFlow('SISTEMA', message.from, 'Cliente entrou no submenu de novidades');
      return;
    }
    
    // Opção 3 - Fazer um Pedido
    if (messageText === '3' || messageText.toLowerCase().includes('fazer pedido') || messageText.toLowerCase().includes('comprar')) {
      console.log(`🤖 Cliente ${message.from} solicitou opção 3: Fazer um Pedido`);
      
      // Inicia o fluxo de pedido
      await processarPedido(message.from, 
        async (text) => {
          try {
            console.log(`📤 Enviando resposta do pedido para ${message.from}: ${text.substring(0, 100)}...`);
            await message.reply(text);
            addMessage(message.from, 'assistant', text);
            logMessageFlow('ENVIADA', message.from, text);
          } catch (e) {
            console.error('❌ Erro ao responder pedido:', e);
          }
        }
      );
      return;
    }
    
    // Opção 4 - Falar com um Atendente
    if (messageText === '4' || messageText.toLowerCase().includes('atendente')) {
      console.log(`🤖 Cliente ${message.from} solicitou opção 4: Falar com um Atendente`);
      await transferirParaAtendenteHumano(message.from, 
        async (text) => {
          if (text) {
            try {
              console.log(`📤 Enviando mensagem de transferência para ${message.from}: ${text.substring(0, 100)}...`);
              await message.reply(text);
              addMessage(message.from, 'assistant', text);
              logMessageFlow('ENVIADA', message.from, text);
            } catch (e) {
              console.error('❌ Erro ao responder transferência:', e);
            }
          }
        });
      return;
    }
    
    // Para outras mensagens, envia o menu novamente
    console.log(`🤖 Enviando menu para ${message.from} (mensagem não reconhecida)`);
    const welcomeMessage = await generateWelcomeMessage(clientName);
    await message.reply(welcomeMessage);
    addMessage(message.from, 'assistant', welcomeMessage);
    logMessageFlow('ENVIADA', message.from, welcomeMessage);
    
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
    
    // Tenta enviar uma mensagem de erro para o usuário
    try {
      const errorMsg = "Ocorreu um erro no processamento. Por favor, tente novamente mais tarde.";
      await message.reply(errorMsg);
      addMessage(message.from, 'assistant', errorMsg);
      logMessageFlow('ENVIADA', message.from, errorMsg);
    } catch (replyError) {
      console.error('❌ Não foi possível enviar mensagem de erro:', replyError);
    }
  }
});

// Limpa arquivos temporários a cada 2 horas
setInterval(() => {
  cleanupTempFiles();
}, 2 * 60 * 60 * 1000);

// Inicializa o cliente WhatsApp
client.initialize();

// Exporta o cliente para uso em outros módulos
module.exports = client;
