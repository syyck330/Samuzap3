const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');
const {
  addMessage,
  updateUserInfo,
  getFormattedHistory,
  isNewUser,
  loadConversation,
  isInHumanSupport,
  updateClientStatus
} = require('./conversationManager');
const { checkInactivityTimeout, logMessageFlow } = require('./utils');

// Gemini API key - preferencialmente definida em .env
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyB-4wC9fIO7Dk8CfMA13731FUUC1BAUNdM';

// Define o endpoint da API Gemini - Atualizado para usar o novo modelo
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Número do telefone do dono da loja para receber notificações de pedidos
const LOJA_PHONE_NUMBER = process.env.NUMERO_DONO_LOJA || '5566999168471'; // Número do dono da loja com código do país (55) e DDD (66)

// Lista de produtos disponíveis
const produtosDisponiveis = [
  // Produtos originais (5 primeiros)
  {
    nome: "Vans UltraRange VR3",
    aliases: ["vans", "ultrarange", "vr3", "vans ultrarange", "ultrarange vr3"],
    descricao: "Um dos nossos destaques é o Vans UltraRange VR3, que está em promoção!",
    link: "https://wa.me/p/9074540646004838/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/VANS.png"
  },
  {
    nome: "Adidas Court Silk",
    aliases: ["adidas", "court silk", "court", "silk", "adidas court", "adidas silk"],
    descricao: "Outro destaque é o ADIDAS FÓRUM LOW AZUL, que está em promoção!",
    link: "https://wa.me/p/9691123497565483/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/ADIDAS.png"
  },
  {
    nome: "Wave Prophecy, Mizuno",
    aliases: ["mizuno", "wave", "prophecy", "wave prophecy", "mizuno wave"],
    descricao: "Também temos o MIZUNO BETA MARINHO/CREME com um ótimo desconto!",
    link: "https://wa.me/p/9523930934311801/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/MIZUNO.png"
  },
  {
    nome: "Air Force 1, Nike.",
    aliases: ["nike", "air force", "air force 1", "force 1", "air", "force"],
    descricao: "Não perca o AIR FORCE BRANCO/CINZA, que está em promoção!",
    link: "https://wa.me/p/9432479643475856/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/NIKE.png"
  },
  {
    nome: "Air Jordan 4",
    aliases: ["jordan", "air jordan", "jordan 4", "aj4", "aj 4"],
    descricao: "Por fim, o AIR JORDAN BRANCO/VERDE está com um preço imperdível!",
    link: "https://wa.me/p/9536849829700700/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/JORDAN.png"
  },
  // Novos produtos adicionados (todos para identificação por imagem)
  {
    nome: "BOSS Black Suede Sneaker",
    aliases: ["boss", "black suede", "boss black", "suede sneaker"],
    descricao: "Elegante BOSS Black Suede Sneaker disponível em nosso catálogo!",
    link: "https://wa.me/p/9372098369546213/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/BOSS_BLACK.jpg"
  },
  {
    nome: "BOSS White Leather Sneaker",
    aliases: ["boss white", "white leather", "leather sneaker"],
    descricao: "Estiloso BOSS White Leather Sneaker disponível para entrega!",
    link: "https://wa.me/p/9156277997833658/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/BOSS_WHITE.jpg"
  },
  {
    nome: "New Balance 9060 Sea Salt",
    aliases: ["new balance", "9060", "sea salt", "new balance 9060"],
    descricao: "Confortável New Balance 9060 Sea Salt em nosso estoque!",
    link: "https://wa.me/p/9531007933649541/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/NEW_BALANCE.jpg"
  },
  {
    nome: "Mizuno Wave Prophecy X",
    aliases: ["mizuno wave", "prophecy x", "wave prophecy x"],
    descricao: "Tecnológico Mizuno Wave Prophecy X disponível para compra!",
    link: "https://wa.me/p/24160985833491271/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/MIZUNO_WAVE.jpg"
  },
  {
    nome: "Nike Shox R4",
    aliases: ["nike shox", "shox r4", "nike r4"],
    descricao: "Esportivo Nike Shox R4 com ótimo desconto!",
    link: "https://wa.me/p/9842617439094972/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/NIKE_SHOX.jpg"
  },
  {
    nome: "Adidas Daily 3.0",
    aliases: ["adidas daily", "daily 3.0", "adidas 3.0"],
    descricao: "Conforto garantido com o Adidas Daily 3.0!",
    link: "https://wa.me/p/9092018940909998/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/ADIDAS_DAILY.jpg"
  },
  {
    nome: "Nike Air Max Plus",
    aliases: ["nike air max", "air max plus", "air max"],
    descricao: "Clássico Nike Air Max Plus em várias cores disponíveis!",
    link: "https://wa.me/p/9777977455546689/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/NIKE_AIR_MAX.jpg"
  },
  {
    nome: "Nike Air Force 1 Low",
    aliases: ["air force 1 low", "nike force low", "af1 low"],
    descricao: "Estilo atemporal com o Nike Air Force 1 Low!",
    link: "https://wa.me/p/9542621782463651/556699916847",
    imagem: "C:/Users/Syyck/Desktop/Samuzap3/tenis/AIR_FORCE_LOW.jpg"
  }
];

// Função para selecionar 3 produtos aleatórios para mostrar como novidades
function selecionarProdutosNovidades() {
  // Faz uma cópia do array para não modificar o original
  const todosProdutos = [...produtosDisponiveis];
  
  // Seleciona aleatoriamente 3 produtos
  const produtosSelecionados = [];
  for (let i = 0; i < 3; i++) {
    if (todosProdutos.length === 0) break;
    
    const randomIndex = Math.floor(Math.random() * todosProdutos.length);
    produtosSelecionados.push(todosProdutos[randomIndex]);
    todosProdutos.splice(randomIndex, 1); // Remove o selecionado para não repetir
  }
  
  return produtosSelecionados;
}

// Função para gerar mensagem de boas-vindas personalizada com menu
async function generateWelcomeMessage(clientName) {
  console.log(`🤖 Gerando mensagem de boas-vindas para ${clientName}`);
  return `Olá! Bem-vindo(a) *${clientName || 'cliente'}* à Medeiros Calçados! 😊

Para facilitar seu atendimento, digite o número da opção desejada:
*1* - Ver Novidades 
*2* - Enviar foto do tênis
*3* - Fazer um Pedido  
*4* - Falar com um Atendente`;
}

// Função para verificar se o cliente está em atendimento humano
// e se o tempo de inatividade já foi atingido
function checkHumanSupportTimeout(chatId) {
  if (!isInHumanSupport(chatId)) return false;
  
  const conversation = loadConversation(chatId);
  const lastUpdate = conversation.lastUpdated || 0;
  
  // Verifica se passaram 30 minutos desde a última atualização
  const result = checkInactivityTimeout(lastUpdate, 30); // 30 minutos
  if (result) {
    console.log(`⏱️ Detectado timeout de inatividade para ${chatId} no atendimento humano`);
  }
  return result;
}

/**
 * Função para enviar uma notificação de novo pedido para o dono da loja via WhatsApp
 * @param {Object} orderData - Dados do pedido
 * @param {string} clientNumber - Número de telefone do cliente
 * @param {string} clientName - Nome do cliente
 * @returns {Promise<boolean>} - True se o envio foi bem-sucedido
 */
async function notificarDonoDaLoja(orderData, clientNumber, clientName) {
  try {
    console.log('📤 ENVIANDO NOTIFICAÇÃO AO DONO DA LOJA:');
    
    // Obter número do dono da loja da variável de ambiente ou usar número fixo se não estiver configurado
    let numeroDonoLoja = process.env.NUMERO_DONO_LOJA;
    
    // Se o número não estiver configurado, usar o número fixo
    if (!numeroDonoLoja) {
      numeroDonoLoja = "5566999168471"; // Número fixo do dono da loja
      console.log(`✅ Usando número fixo do dono da loja: ${numeroDonoLoja}`);
    } else {
      console.log(`✅ Usando número do dono da loja da variável de ambiente: ${numeroDonoLoja}`);
    }
    
    // Formata o número do cliente para remover o @ do WhatsApp Web
    const clientNumberFormatted = clientNumber.replace('@c.us', '');
    
    // Prepara a mensagem para o dono da loja
    const mensagem = `*NOVO PEDIDO RECEBIDO!* 📦\n\n` +
                     `*Resumo do pedido:*\n` +
                     `📦 Produto: ${orderData.modelo}\n` +
                     `📏 Tamanho: ${orderData.tamanho}\n` +
                     `🎨 Cor: ${orderData.cor}\n` +
                     `📱 Contato: ${clientNumberFormatted}\n\n` +
                     `*Cliente:* ${clientName}\n\n` +
                     `"Esta é uma notificação automática. Não responda a esta mensagem."`;
    
    // Remove qualquer caractere não numérico do número da loja
    const numeroLojaFormatado = numeroDonoLoja.replace(/\D/g, '');
    
    // Codifica a mensagem para URL
    const mensagemCodificada = encodeURIComponent(mensagem);
    
    // Gera o link do WhatsApp corretamente formatado
    const whatsappLink = `https://api.whatsapp.com/send?phone=${numeroLojaFormatado}&text=${mensagemCodificada}`;
    
    console.log('🔗 Link de notificação gerado:', whatsappLink);
    
    // Tentativa de envio via API - REMOVA OU ATUALIZE ESTA PARTE COM SUA API REAL
    try {
      // ATENÇÃO: Esta é uma API de exemplo (callmebot), substitua pela sua própria API
      // Remova ou atualize esta parte conforme sua necessidade
      await axios.get(`https://api.callmebot.com/whatsapp.php?phone=${numeroLojaFormatado}&text=${mensagemCodificada}&apikey=SUA_CHAVE_AQUI`);
      console.log('✅ Notificação enviada via API');
    } catch (apiError) {
      console.log('ℹ️ Não foi possível enviar via API. Usando link direto:', apiError.message);
    }
    
    // Registra a notificação no log
    logMessageFlow('NOTIFICAÇÃO', 'Dono da Loja', mensagem);
    
    // Exporta o link para uso externo também (opcional)
    module.exports.lastNotificationLink = whatsappLink;
    
    // Retorna o link para que possa ser usado pelo bot para enviar para o cliente
    return {
      success: true,
      link: whatsappLink,
      message: mensagem
    };
  } catch (error) {
    console.error('❌ Erro ao enviar notificação para o dono da loja:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Função para transferir para o atendente humano
async function transferirParaAtendenteHumano(chatId, sendMessageCallback) {
  console.log(`🔄 Iniciando transferência para atendente humano para ${chatId}`);
  
  // Verifica se já está em atendimento humano
  if (isInHumanSupport(chatId)) {
    console.log(`⚠️ Cliente ${chatId} já está em atendimento humano, ignorando transferência`);
    return;
  }
  
  const mensagem = "Olá! Sou o *Samuel*, posso te ajudar com seu pedido?";
  await sendMessageCallback(mensagem);
  logMessageFlow('ENVIADA', chatId, mensagem);
  
  // Atualiza o status do cliente para em_atendimento
  updateClientStatus(chatId, 'em_atendimento');
  
  // Registra no log que o cliente foi transferido para atendimento humano
  console.log(`👨‍💼 Cliente ${chatId} transferido para atendimento humano`);
}

/**
 * Analisa uma imagem usando a API Gemini
 * @param {string} imagePath - Caminho para o arquivo de imagem
 * @param {string} chatId - Identificador único do chat
 * @param {Function} sendMessageCallback - Função para enviar mensagem ao usuário
 * @returns {Promise<boolean>} - True se um produto foi encontrado, false caso contrário
 */
async function analyzeImageWithGemini(imagePath, chatId, sendMessageCallback) {
  try {
    console.log('🖼️ Analisando imagem com Gemini:', imagePath);
    logMessageFlow('SISTEMA', chatId, `Iniciando análise de imagem: ${imagePath}`);

    // Verifica se o arquivo existe
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ Arquivo de imagem não encontrado: ${imagePath}`);
      const errorMsg = "Não consegui acessar a imagem. Pode tentar enviá-la novamente?";
      await sendMessageCallback(errorMsg);
      logMessageFlow('ENVIADA', chatId, errorMsg);
      return false;
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Verificar se a imagem não está vazia
    if (!base64Image || base64Image.length < 100) {
      console.error('❌ Imagem inválida ou corrompida');
      const errorMsg = "A imagem parece estar corrompida. Pode tentar enviar outra?";
      await sendMessageCallback(errorMsg);
      logMessageFlow('ENVIADA', chatId, errorMsg);
      return false;
    }

    // Lista de modelos para buscar na imagem
    const nomesModelos = produtosDisponiveis.map(p => p.nome.toLowerCase());
    console.log('🔍 Procurando por modelos na imagem:', nomesModelos.join(', '));

    // Criar um texto com os nomes dos produtos disponíveis
    const produtosTexto = produtosDisponiveis.map(p => `- ${p.nome}`).join('\n');

    // Atualizado para usar o modelo gemini-1.5-flash
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Análise detalhada desta imagem de tênis:
1. Descreva detalhadamente o tênis que você está vendo (marca, modelo, cores, características).
2. Determine se o tênis mostrado corresponde a algum dos modelos a seguir:
${produtosTexto}

Se for um dos modelos listados, inclua a frase "MODELO_IDENTIFICADO: [Nome exato do modelo]" no início da sua resposta.
Se não for um dos modelos listados, inclua "MODELO_NÃO_IDENTIFICADO" no início da sua resposta.

Forneça uma descrição detalhada independentemente de ser um modelo listado ou não.`
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 800
      }
    };

    console.log('🔄 Enviando imagem para análise...');
    logMessageFlow('SISTEMA', chatId, 'Enviando imagem para API Gemini');
    
    const response = await axios.post(geminiApiUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 segundos
    });

    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const analysisResult = response.data.candidates[0].content.parts[0].text;
      console.log('📋 Análise completa da imagem:', analysisResult.substring(0, 200) + '...');
      logMessageFlow('SISTEMA', chatId, `Resultado da análise recebido (${analysisResult.length} caracteres)`);
      
      // Verificar se a resposta indica que identificou algum modelo
      let produtoEncontrado = null;
      
      if (analysisResult.includes('MODELO_IDENTIFICADO:')) {
        // Extrair o nome do modelo da resposta
        const modeloMatch = analysisResult.match(/MODELO_IDENTIFICADO:\s*([^\n]+)/);
        
        if (modeloMatch && modeloMatch[1]) {
          const modeloIdentificado = modeloMatch[1].trim();
          console.log('✅ Modelo identificado na análise:', modeloIdentificado);
          logMessageFlow('SISTEMA', chatId, `Modelo identificado: ${modeloIdentificado}`);
          
          // Verificar qual produto foi encontrado
          for (const produto of produtosDisponiveis) {
            if (modeloIdentificado.toLowerCase().includes(produto.nome.toLowerCase()) || 
                produto.aliases.some(alias => modeloIdentificado.toLowerCase().includes(alias.toLowerCase()))) {
              produtoEncontrado = produto;
              break;
            }
          }
        }
      } else {
        console.log('❌ Nenhum modelo identificado explicitamente');
        logMessageFlow('SISTEMA', chatId, 'Nenhum modelo identificado explicitamente');
        
        // Verificação alternativa de termos na descrição
        for (const produto of produtosDisponiveis) {
          // Verificar o nome principal
          if (analysisResult.toLowerCase().includes(produto.nome.toLowerCase())) {
            produtoEncontrado = produto;
            console.log('🔍 Encontrado por menção ao nome:', produto.nome);
            logMessageFlow('SISTEMA', chatId, `Produto identificado por menção ao nome: ${produto.nome}`);
            break;
          }
          
          // Verificar aliases
          for (const alias of produto.aliases) {
            if (analysisResult.toLowerCase().includes(alias.toLowerCase())) {
              produtoEncontrado = produto;
              console.log('🔍 Encontrado por menção ao alias:', alias);
              logMessageFlow('SISTEMA', chatId, `Produto identificado por menção ao alias: ${alias}`);
              break;
            }
          }
          
          if (produtoEncontrado) break;
        }
      }
      
      if (produtoEncontrado) {
        const mensagemCliente = `Tênis ${produtoEncontrado.nome} identificado. Disponível em estoque! Confira no catálogo: ${produtoEncontrado.link}`;
        console.log('✅ Produto encontrado em estoque:', produtoEncontrado.nome);
        await sendMessageCallback(mensagemCliente);
        logMessageFlow('ENVIADA', chatId, mensagemCliente);
        return true;
      } else {
        const mensagemCliente = "Infelizmente, não temos esse produto no estoque. Deseja ver outros modelos disponíveis?";
        console.log('❌ Produto não encontrado no estoque');
        await sendMessageCallback(mensagemCliente);
        logMessageFlow('ENVIADA', chatId, mensagemCliente);
        return false;
      }
    } else {
      console.log('⚠️ Resposta inválida da API Gemini:', JSON.stringify(response.data, null, 2));
      const errorMessage = "Não consegui analisar a imagem. Pode tentar enviar uma foto mais clara do tênis?";
      await sendMessageCallback(errorMessage);
      logMessageFlow('ENVIADA', chatId, errorMessage);
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao analisar imagem com Gemini:', error);
    logMessageFlow('ERRO', chatId, `Erro ao analisar imagem: ${error.message}`);

    if (error.response) {
      console.error('Detalhes do erro:', error.response.status, error.response.data);
      logMessageFlow('ERRO', chatId, `Detalhes do erro API: ${error.response.status}`);
    }

    const errorMessage = "Ocorreu um erro ao analisar a imagem. Pode tentar enviar uma nova foto ou descrever o tênis que está procurando?";
    await sendMessageCallback(errorMessage);
    logMessageFlow('ENVIADA', chatId, errorMessage);
    return false;
  }
}

/**
 * Processa a opção 1 (Ver Novidades) enviando produtos um a um sequencialmente
 * @param {string} chatId - Identificador único do chat
 * @param {Function} sendMessageCallback - Função para enviar mensagem ao usuário
 */
async function processNovidades(chatId, sendMessageCallback) {
  try {
    console.log('🏬 Processando opção Ver Novidades para chatId:', chatId);
    logMessageFlow('SISTEMA', chatId, 'Iniciando envio de catálogo de produtos');
    
    // Seleciona apenas 3 produtos aleatoriamente
    const produtosParaMostrar = selecionarProdutosNovidades();
    
    for (const produto of produtosParaMostrar) {
      try {
        // Verifica se o caminho da imagem existe
        if (fs.existsSync(produto.imagem)) {
          // Envia a imagem do produto
          const media = MessageMedia.fromFilePath(produto.imagem);
          await sendMessageCallback(media);
          console.log(`📤 Enviando imagem do produto ${produto.nome} para ${chatId}`);
          logMessageFlow('SISTEMA', chatId, `Enviando imagem: ${produto.nome}`);
          
          // Aguarda um pouco antes de enviar a descrição
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Envia a descrição e o link do produto
          const descricaoProduto = `${produto.descricao}\nConfira aqui: ${produto.link}`;
          await sendMessageCallback(descricaoProduto);
          logMessageFlow('ENVIADA', chatId, descricaoProduto);
          
          // Aguarda um pouco antes de enviar o próximo produto
          await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 segundos
        } else {
          console.error(`❌ Imagem não encontrada: ${produto.imagem}`);
          logMessageFlow('ERRO', chatId, `Imagem não encontrada: ${produto.imagem}`);
          await sendMessageCallback(`${produto.descricao}\nConfira aqui: ${produto.link}`);
          logMessageFlow('ENVIADA', chatId, `${produto.descricao}\nConfira aqui: ${produto.link}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao processar produto ${produto.nome}:`, error);
        logMessageFlow('ERRO', chatId, `Erro ao processar produto ${produto.nome}: ${error.message}`);
        // Tenta enviar apenas o texto se a imagem falhar
        await sendMessageCallback(`${produto.descricao}\nConfira aqui: ${produto.link}`);
        logMessageFlow('ENVIADA', chatId, `${produto.descricao}\nConfira aqui: ${produto.link}`);
      }
    }
    
    // Nova mensagem após mostrar os produtos selecionados
    // Usando números 1 e 0 para as opções
    const finalMessage = `Estes são alguns dos nossos destaques do momento! Gostou de algum modelo?  
➡️ Digite *1* para falar com um atendente.   
➡️ Digite *0* para voltar ao menu inicial.   

Caso queira mais opções ou buscar um modelo específico, posso te ajudar com isso também! 😊`;

    await sendMessageCallback(finalMessage);
    logMessageFlow('ENVIADA', chatId, finalMessage);
    
    // Atualiza o estado do usuário para indicar que está no submenu de novidades
    updateUserInfo(chatId, 'currentState', 'novidades_submenu');
    
    console.log(`✅ Catálogo enviado com sucesso para ${chatId}`);
    logMessageFlow('SISTEMA', chatId, 'Catálogo enviado com sucesso');
    return true; // Indica que o processamento foi concluído com sucesso
    
  } catch (error) {
    console.error('❌ Erro ao processar novidades:', error);
    logMessageFlow('ERRO', chatId, `Erro ao processar novidades: ${error.message}`);
    const errorMsg = "Desculpe, tive um problema ao mostrar as novidades. Pode tentar novamente?";
    await sendMessageCallback(errorMsg);
    logMessageFlow('ENVIADA', chatId, errorMsg);
    return false;
  }
}

/**
 * Função para processar respostas do submenu de novidades
 * @param {string} chatId - ID do chat do cliente
 * @param {string} mensagem - Texto da mensagem do usuário
 * @param {Function} sendMessageCallback - Função para enviar mensagem ao usuário
 * @returns {Promise<boolean>} - True se a mensagem foi processada dentro do submenu
 */
async function processarSubmenuNovidades(chatId, mensagem, sendMessageCallback) {
  const texto = mensagem.toLowerCase().trim();
  
  // Verifica se o cliente está no submenu de novidades
  const conversation = loadConversation(chatId);
  if (conversation.userInfo.currentState !== 'novidades_submenu') {
    return false; // Não está no submenu de novidades
  }
  
  console.log(`🔄 Processando resposta do submenu de novidades: "${texto}" para ${chatId}`);
  
  if (texto === '1') {
    // Opção para falar com atendente
    await transferirParaAtendenteHumano(chatId, sendMessageCallback);
    // Resetar o estado do cliente após transferência
    updateUserInfo(chatId, 'currentState', null);
    return true;
  } else if (texto === '0') {
    // Opção para voltar ao menu inicial
    const clientName = conversation.userInfo.name || 'cliente';
    const menuMessage = await generateWelcomeMessage(clientName);
    
    await sendMessageCallback(menuMessage);
    logMessageFlow('ENVIADA', chatId, menuMessage);
    
    // Resetar o estado do cliente
    updateUserInfo(chatId, 'currentState', null);
    return true;
  }
  
  // Se chegou aqui, a mensagem não corresponde a nenhuma opção do submenu
  const ajudaMsg = "Por favor, escolha uma opção válida:\n" +
                  "➡️ *1* para falar com um atendente.\n" +
                  "➡️ *0* para voltar ao menu inicial.";
  
  await sendMessageCallback(ajudaMsg);
  logMessageFlow('ENVIADA', chatId, ajudaMsg);
  return true;
}

/**
 * Processa a opção 3 (Fazer um Pedido) com fluxo de perguntas sequenciais
 * @param {string} chatId - Identificador único do chat
 * @param {Function} sendMessageCallback - Função para enviar mensagem ao usuário
 * @param {string|null} currentResponse - Resposta atual do cliente, se houver
 * @returns {Promise<boolean>} - True se o processamento foi concluído com sucesso
 */
async function processarPedido(chatId, sendMessageCallback, currentResponse = null) {
  try {
    console.log('🛒 Processando pedido para chatId:', chatId);
    logMessageFlow('SISTEMA', chatId, 'Processando pedido');
    
    const conversation = loadConversation(chatId);
    const orderData = conversation.userInfo.orderData || {};
    const orderStep = conversation.userInfo.orderStep || 'inicio';
    
    // Se há uma resposta do usuário, processamos conforme a etapa atual
    if (currentResponse) {
      switch(orderStep) {
        case 'inicio':
          // Pula direto para a seleção do modelo
          updateUserInfo(chatId, 'orderStep', 'modelo');
          
          const modeloMsg = "Por favor, informe o modelo do tênis que você deseja comprar:";
          await sendMessageCallback(modeloMsg);
          logMessageFlow('ENVIADA', chatId, modeloMsg);
          return true;
          
        case 'modelo':
          // Usuário está informando o modelo manualmente
          orderData.modelo = currentResponse;
          updateUserInfo(chatId, 'orderData', orderData);
          updateUserInfo(chatId, 'orderStep', 'tamanho');
          
          const tamanhoMsg = "Qual tamanho você deseja?";
          await sendMessageCallback(tamanhoMsg);
          logMessageFlow('ENVIADA', chatId, tamanhoMsg);
          return true;
          
        case 'tamanho':
          orderData.tamanho = currentResponse;
          updateUserInfo(chatId, 'orderData', orderData);
          updateUserInfo(chatId, 'orderStep', 'cor');
          
          const corMsg = "Qual cor você prefere?";
          await sendMessageCallback(corMsg);
          logMessageFlow('ENVIADA', chatId, corMsg);
          return true;
          
        case 'cor':
          orderData.cor = currentResponse;
          updateUserInfo(chatId, 'orderData', orderData);
          
          // Obter o nome do cliente
          const clientName = conversation.userInfo.name || 'Cliente';
          
          // Enviar notificação ao dono da loja
          const notificacao = await notificarDonoDaLoja(orderData, chatId, clientName);
          
          if (notificacao.success) {
            console.log('✅ Notificação enviada com sucesso ao dono da loja');
          } else {
            console.error('❌ Falha ao notificar dono da loja:', notificacao.error);
          }
          
          // Montando o resumo simplificado do pedido
          const resumoMsg = `*Resumo do seu pedido:*\n\n` +
                           `📦 *Produto:* ${orderData.modelo}\n` +
                           `📏 *Tamanho:* ${orderData.tamanho}\n` +
                           `🎨 *Cor:* ${orderData.cor}\n\n` +
                           `Seu pedido foi registrado com sucesso! Um atendente entrará em contato em breve.`;
          
          await sendMessageCallback(resumoMsg);
          logMessageFlow('ENVIADA', chatId, resumoMsg);
          
          // Aguarda um pouco antes da transferência
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Reseta o fluxo de pedido após transferência
          updateUserInfo(chatId, 'orderStep', null);
          
          // Transfere o cliente para atendimento humano
          await transferirParaAtendenteHumano(chatId, sendMessageCallback);
          return true;
      }
    } else {
      // Inicia o processo de pedido (primeira interação)
      updateUserInfo(chatId, 'orderStep', 'inicio');
      updateUserInfo(chatId, 'orderData', {});
      
      // Ir diretamente para perguntar o modelo
      const modeloMsg = "Por favor, informe o modelo do tênis que você deseja comprar:";
      await sendMessageCallback(modeloMsg);
      logMessageFlow('ENVIADA', chatId, modeloMsg);
      updateUserInfo(chatId, 'orderStep', 'modelo');
      return true;
    }
    
    return false; // Não deveria chegar aqui
    
  } catch (error) {
    console.error('❌ Erro ao processar pedido:', error);
    logMessageFlow('ERRO', chatId, `Erro ao processar pedido: ${error.message}`);
    
    // Envia mensagem de erro e reinicia o fluxo
    const errorMsg = "Desculpe, ocorreu um erro ao processar seu pedido. Vamos recomeçar.";
    await sendMessageCallback(errorMsg);
    logMessageFlow('ENVIADA', chatId, errorMsg);
    
    // Reinicia o fluxo
    updateUserInfo(chatId, 'orderStep', null);
    
    return false;
  }
}

/**
 * Função para verificar se a pergunta do usuário é sobre estoque
 * @param {string} mensagem - Mensagem do usuário
 * @returns {boolean} - True se a pergunta for sobre estoque
 */
function isPerguntaEstoque(mensagem) {
  const textoDaPergunta = mensagem.toLowerCase();
  
  // Lista de palavras-chave relacionadas a perguntas de estoque
  const palavrasEstoque = ['tem', 'disponível', 'disponivel', 'estoque', 'disponibilidade', 
                          'quando chega', 'chegou', 'vai chegar', 'em falta'];
  
  // Verificar se a pergunta contém palavras relacionadas a estoque
  return palavrasEstoque.some(palavra => textoDaPergunta.includes(palavra));
}

/**
 * Verifica se um cliente está no submenu de novidades
 * @param {string} chatId - ID do chat do cliente
 * @returns {boolean} - True se o cliente estiver no submenu de novidades
 */
function isInNovidadesSubmenu(chatId) {
  try {
    const conversation = loadConversation(chatId);
    return conversation?.userInfo?.currentState === 'novidades_submenu';
  } catch (error) {
    console.error('❌ Erro ao verificar se está no submenu de novidades:', error);
    return false;
  }
}

/**
 * Processa opções do submenu de novidades
 * @param {string} chatId - ID do chat
 * @param {string} option - Opção selecionada no submenu
 * @param {function} sendMessageCallback - Função para enviar mensagem
 * @param {string} clientName - Nome do cliente
 */
async function processNovidadesSubmenu(chatId, option, sendMessageCallback, clientName) {
  try {
    logMessageFlow('SISTEMA', chatId, `Processando opção ${option} do submenu de novidades`);
    
    if (option === '1') {
      // Transferir para atendente humano
      console.log(`🔄 Cliente ${chatId} solicitou falar com atendente após ver novidades`);
      await transferirParaAtendenteHumano(chatId, sendMessageCallback);
      
      // Limpa o estado de submenu após a transferência
      updateUserInfo(chatId, 'currentState', null);
      return true;
    } else if (option === '0') {
      // Voltar ao menu principal
      console.log(`🔄 Cliente ${chatId} solicitou voltar ao menu principal após ver novidades`);
      const welcomeMessage = await generateWelcomeMessage(clientName);
      await sendMessageCallback(welcomeMessage);
      
      // Limpa o estado de submenu após enviar o menu principal
      updateUserInfo(chatId, 'currentState', null);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Erro ao processar submenu de novidades:', error);
    logMessageFlow('ERRO', chatId, `Erro ao processar submenu de novidades: ${error.message}`);
    return false;
  }
}

// Exporta as funções
module.exports = {
  generateWelcomeMessage,
  analyzeImageWithGemini,
  processNovidades,
  processarSubmenuNovidades,
  checkHumanSupportTimeout,
  transferirParaAtendenteHumano,
  processarPedido,
  notificarDonoDaLoja,
  isPerguntaEstoque,
  isInNovidadesSubmenu,
  processNovidadesSubmenu
};
