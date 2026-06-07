const API_URL = "https://qcsoftware2.onrender.com";

const mapaConteiner = document.getElementById('mapa-conteiner');
const banner = document.getElementById('banner-alerta');
const audioAlerta = document.getElementById('audio-alerta');

// Elementos do Modal
const modal = document.getElementById('modal-problema');
const modalTitulo = document.getElementById('modal-titulo');
const modalIdMaquina = document.getElementById('modal-id-maquina');
const modalDataHora = document.getElementById('modal-data-hora');
const modalColaborador = document.getElementById('modal-colaborador');
const modalDescricao = document.getElementById('modal-descricao');
const btnAcao = document.getElementById('btn-acao');

// Variável de controle para o som tocar apenas uma vez por bloco de falhas
let alertaJaTocou = false;

async function atualizarPainelIndustrial() {
    try {
        // Rota sincronizada com a API do PostgreSQL no Neon
        const resposta = await fetch('/api/mapamaquinas');
        const maquinas = await resposta.json();

        // 🚀 ADICIONE ESTA LINHA AQUI:
        maquinas = maquinas.slice(0, 30);
        
        mapaConteiner.innerHTML = '';
        let temMaquinaParada = false;

        maquinas.forEach((maq, index) => {
            const container = document.createElement('div');
            container.className = 'maquina-container';
            
            const colunas = 10;
            const espacamentoX = 110; 
            const espacamentoY = 105; 
            
            const posX = (index % colunas) * espacamentoX + 25;
            const posY = Math.floor(index / colunas) * espacamentoY + 30;

            container.style.left = `${posX}px`;
            container.style.top = `${posY}px`;
            
            // Renderização utilizando a classe de status dinâmica (Normal, Parado, Manutenção)
            container.innerHTML = `
                <div class="maquina-icone ${maq.status || 'Normal'}">
                    <i class="fa-solid fa-industry"></i>
                </div>
                <div class="maquina-nome">#${maq.id_maquinas} ${maq.nome}</div>
            `;
            
            container.title = `Equipamento: ${maq.nome}\nStatus: ${maq.status || 'Normal'}`;
            
            container.addEventListener('click', () => abrirModal(maq.id_maquinas, maq.nome));

            mapaConteiner.appendChild(container);

            // O Alarme dispara apenas se houver alguma máquina efetivamente "Parada"
            if (maq.status === 'Parado') {
                temMaquinaParada = true;
            }
        });

        // Gerenciamento Inteligente do Banner de Emergência e do Áudio
        if (temMaquinaParada) {
            banner.style.display = 'block';
            if (!alertaJaTocou) {
                audioAlerta.play().catch(() => console.log("Áudio aguardando clique inicial do usuário para liberação do navegador."));
                alertaJaTocou = true;
            }
        } else {
            banner.style.display = 'none';
            audioAlerta.pause();
            audioAlerta.currentTime = 0;
            alertaJaTocou = false; 
        }

    } catch (erro) {
        console.error("Erro ao obter dados das máquinas do Neon:", erro);
    }
}

// GERENCIAMENTO DO MODAL (CADASTRO / VISUALIZAÇÃO / RESOLUÇÃO)
async function abrirModal(id, nome) {
    modalIdMaquina.value = id;
    modalTitulo.innerText = `Histórico / Ocorrência - ${nome} (#${id})`;

    // Silencia o áudio imediatamente ao abrir a janela para manter o foco na tratativa técnica
    audioAlerta.pause();

    try {
        const resposta = await fetch(`/api/mapamaquinas/${id}/ocorrencia`);
        const dados = await resposta.json();

        if (dados.tem_ocorrencia) {
            // MODO VISUALIZAÇÃO: Exibe os dados da quebra atual e bloqueia edição preliminar
            modalDataHora.value = dados.data_hora;
            modalColaborador.value = dados.colaborador;
            modalDescricao.value = dados.problema;

            modalColaborador.disabled = true;
            modalDescricao.disabled = true;

            // Botão direciona para a transição de manutenção e posterior fechamento
            btnAcao.innerText = "Iniciar / Finalizar Manutenção";
            btnAcao.className = "btn";
            btnAcao.style.backgroundColor = "#f1c40f"; 
            btnAcao.onclick = () => prepararResolucao(id, nome);
        } else {
            // MODO CADASTRO: Libera os inputs para registrar um novo evento de parada
            const agora = new Date();
            modalDataHora.value = agora.toLocaleString('pt-BR');
            modalColaborador.value = '';
            modalDescricao.value = '';

            modalColaborador.disabled = false;
            modalDescricao.disabled = false;
            modalColaborador.placeholder = "Nome do operador";
            modalDescricao.placeholder = "Descreva os sintomas ou o código da falha...";

            btnAcao.innerText = "Gravar Ocorrência";
            btnAcao.className = "btn btn-salvar";
            btnAcao.style.backgroundColor = "#e74c3c"; 
            btnAcao.onclick = salvarOcorrencia;
        }

        modal.style.display = 'block';
    } catch (erro) {
        console.error("Erro ao processar estado do modal:", erro);
    }
}

// Transforma o modal atual no formulário de resolução e avisa o backend da manutenção
async function prepararResolucao(id, nome) {
    try {
        // Informa ao servidor que a equipe técnica assumiu o posto (Muda cor para Amarelo no mapa de fundo)
        await fetch(`/api/mapamaquinas/${id}/manutencao`, { method: 'POST' });
        atualizarPainelIndustrial();

        modalTitulo.innerText = `Registrar Solução - ${nome} (#${id})`;
        
        const agora = new Date();
        modalDataHora.value = agora.toLocaleString('pt-BR');
        
        // Configura os campos para entrada do relatório de engenharia / manutenção
        modalColaborador.value = '';
        modalColaborador.disabled = false;
        modalColaborador.placeholder = "Nome do técnico / mecânico";
        
        modalDescricao.value = '';
        modalDescricao.disabled = false;
        modalDescricao.placeholder = "O que foi feito para solucionar o problema e liberar a linha?";

        // Ajusta botão para encerramento completo (Retorna cor para Verde)
        btnAcao.innerText = "Salvar e Ativar Máquina";
        btnAcao.style.backgroundColor = "#2ecc71";
        btnAcao.onclick = () => enviarResolucao(id);
    } catch (erro) {
        console.error("Erro ao transicionar máquina para estado de manutenção:", erro);
    }
}

async function enviarResolucao(id) {
    const colaborador = modalColaborador.value.trim();
    const comentario = modalDescricao.value.trim();

    if (!colaborador || !comentario) {
        alert("Por favor, informe seu nome e o relatório de manutenção!");
        return;
    }

    try {
        const resposta = await fetch(`/api/mapamaquinas/${id}/resolver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data_hora: modalDataHora.value,
                colaborador: colaborador,
                comentario: comentario
            })
        });
        
        if (resposta.ok) {
            fecharModal();
            atualizarPainelIndustrial(); 
        } else {
            alert("Erro ao enviar o encerramento ao servidor PostgreSQL.");
        }
    } catch (erro) {
        console.error("Erro ao processar fechamento da OS:", erro);
    }
}

function fecharModal() {
    modal.style.display = 'none';
    // Ao fechar sem salvar, revalida o painel para restaurar estados ou alarmes pendentes
    atualizarPainelIndustrial();
}

async function salvarOcorrencia() {
    const id = modalIdMaquina.value;
    const colaborador = modalColaborador.value.trim();
    const problema = modalDescricao.value.trim();

    if (!colaborador || !problema) {
        alert("Por favor, preencha o nome do colaborador e o problema identificado!");
        return;
    }

    try {
        const respuesta = await fetch(`/api/mapamaquinas/${id}/ocorrencia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data_hora: modalDataHora.value,
                colaborador: colaborador,
                problema: problema
            })
        });

        if (respuesta.ok) {
            fecharModal();
            atualizarPainelIndustrial();
        } else {
            alert("Erro ao registrar a ocorrência no servidor.");
        }
    } catch (erro) {
        console.error("Erro na requisição de salvamento:", erro);
    }
}

// Configuração dos tempos de pooling em tempo real (2 segundos)
setInterval(atualizarPainelIndustrial, 2000);
atualizarPainelIndustrial();