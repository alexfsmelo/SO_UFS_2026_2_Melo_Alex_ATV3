# Números e perguntas para a apresentação (Atividade 3)

## Números para memorizar

| O quê | Valor |
|---|---|
| Ambiente | WSL2 no notebook, Ubuntu 26.04, kernel 6.6.114.1, 4 CPUs, 7,8 GiB, Docker 29.1.3, cgroup v2 |
| Kernel visto dentro e fora do contêiner | 6.6.114.1-microsoft-standard-WSL2 (o mesmo) |
| PIDs no host dos contêineres A e B | 4422 e 4476 (os dois são PID 1 por dentro) |
| N (trabalho fixo) | 40.000.000 iterações, checksum 098953c3ffd76aa3 |
| cpu.max em C1 e C2 | 50000 100000 e 100000 100000 |
| Tempo de parede mediano C1 e C2 | 25,07 s e 12,30 s |
| Vazão mediana C1 e C2 | 1,60 e 3,25 milhões de iterações por segundo |
| Razão C2 / C1 | 2,04 (na execução preliminar em nuvem: 2,14) |
| Throttling | C1: 100% dos períodos (248 a 253), 12,54 s de espera; C2: 6 períodos, 3,2 ms, numa repetição |
| CPU efetiva | C1: 0,500; C2: 1,000 |
| Read-only | D1 e D2: EROFS (montagem); D3: EACCES (permissão) |

## Perguntas prováveis e respostas curtas

**Onde rodou?** No meu notebook, no WSL2 com Ubuntu 26.04 e Docker Engine instalado dentro dele. O WSL2 é uma VM leve criada pelo Hyper-V do Windows.

**Então há uma VM?** Sim, uma só, a do WSL2, para o ambiente inteiro. Os contêineres não têm VM nem kernel próprios: `uname -r` dá o mesmo valor dentro e fora.

**Como você sabe que o limite foi aplicado?** Li `cpu.max` de dentro do contêiner, que vem do kernel, e os contadores fecham: C1 usou 0,500 CPU em média e teve throttling em todos os períodos.

**Quota de 0,5 CPU quer dizer meio núcleo reservado?** Não. É 50 ms de CPU a cada 100 ms, somados no grupo. Não reserva núcleo nem fixa afinidade.

**Por que C2 quase não teve throttling?** A carga tem uma thread e não passa de 1 CPU; a quota de 1,0 só foi tocada no limite de 6 períodos, 3,2 ms no total.

**Por que a razão deu 2,04 e não 2?** C1 gastou 1,8% mais CPU para o mesmo trabalho. Na nuvem, onde o host é compartilhado, foram 7,4% e razão 2,14. Hipótese: ruído do host. Com três repetições não dá para afirmar a causa.

**Qual a maior ameaça à validade?** Ruído do notebook (o Windows roda junto), n = 3 e carga de uma thread só.

**Dois contêineres com PID 1 são o mesmo processo?** Não. `NSpid` mostra 4422 1 para A e 4476 1 para B: cada tarefa tem um número em cada tabela de PID.

**Por que o cgroup namespace deu diferente?** Em cgroup v2 o Docker cria um cgroup namespace privado por contêiner. Na execução preliminar, em cgroup v1, ele era o do host.

**Read-only prova isolamento?** Não. Prova que a montagem nega escrita. O processo ainda lê o que foi montado, e o kernel é compartilhado.

**Qual a diferença entre EROFS e EACCES?** EROFS vem da flag read-only da montagem e vale até para root. EACCES vem das permissões do arquivo (dono e modo).

**RSS, memory.current e memory.peak são a mesma coisa?** Não. RSS é do processo e inclui bibliotecas compartilhadas; current é o que o grupo usa agora; peak é o máximo desde a criação do grupo.

**Por que precisou de root na Parte B?** Para ler `/proc/<PID>/ns` de processos do root. A primeira tentativa, sem root, está guardada no repositório.

**Como você usou IA?** Eu conduzi o trabalho: decidi rodar no meu notebook, executei todas as medições e o experimento extra, e defini o formato das entregas. O Claude me ajudou a estruturar a ideia a partir do enunciado, escreveu os scripts, conferiu comigo cada execução e fez a primeira versão do relatório e dos slides. Está tudo declarado na DECLARACAO_IA.md.

**Por que você fez o experimento extra?** As seis execuções só leem o cpu.stat no começo e no fim, então mostram quanto throttling houve, mas não como. O teste extra lê o cpu.stat a cada 20 ms e mostra que a quota liga e desliga o processo, cerca de 50 ms a cada 100 ms, em vez de deixar a CPU mais lenta.

**Por que os tempos do experimento extra são maiores?** Naquela rodada o mesmo trabalho gastou mais CPU (o notebook estava mais lento, possivelmente por energia ou temperatura). Por isso ela não entra nas medianas; a inclinação, que é o que o teste mede, continua 0,5 e 1,0.
