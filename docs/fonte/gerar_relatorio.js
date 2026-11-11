// Gera docs/relatorio_ATV3_SO_Alex_Melo.docx no modelo do relatorio da ATV1 (capa, secoes "1-Titulo",
// tabelas com titulo acima e figuras com titulo abaixo, "Fonte: Autor."), a partir dos CSV e registros em results/.
// Uso: node docs/fonte/gerar_relatorio.js   (depois converter para PDF com LibreOffice)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, ImageRun, LevelFormat, BorderStyle, Header, PageNumber, TabStopType,
  TabStopPosition, LeaderType, SectionType, VerticalAlign,
} = require("docx");

const RAIZ = path.resolve(__dirname, "..", "..");
const R = (...p) => path.join(RAIZ, ...p);

// ---------------------------------------------------------------- dados
function csv(p) {
  const [cab, ...linhas] = fs.readFileSync(p, "utf8").trim().split(/\r?\n/);
  const k = cab.split(",");
  return linhas.map((l) => Object.fromEntries(l.split(",").map((v, i) => [k[i], v])));
}
function kv(p) {
  const o = {};
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) o[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return o;
}
const ex = csv(R("results/tabelas/execucoes.csv")).sort((a, b) => +a.ordem - +b.ordem);
const val = ex.filter((r) => r.valida === "True");
const rs = Object.fromEntries(csv(R("results/tabelas/resumo_condicoes.csv")).map((r) => [r.condicao, r]));
const nuvem = Object.fromEntries(csv(R("results_vm_nuvem/tabelas/resumo_condicoes.csv")).map((r) => [r.condicao, r]));
const ns = csv(R("results/namespaces/namespaces.csv"));
const regA = kv(R("results/namespaces/registro_A.txt"));
const regB = kv(R("results/namespaces/registro_B.txt"));
const regH = kv(R("results/namespaces/registro_host.txt"));
const amb = kv(R("results/ambiente/ambiente.txt"));
const par = kv(R("results/raw/execucoes/parametros.txt"));
const ro = fs.readFileSync(R("results/mount/readonly.txt"), "utf8");
const refChk = fs.readFileSync(R("results/tabelas/checksum_referencia_N40000000.txt"), "utf8").split(" ")[0];
const piloto = Object.fromEntries(["C1", "C2"].map((c) => [c, JSON.parse(fs.readFileSync(R("results/raw/piloto", c + "_r1_t1.json"), "utf8"))]));

const f = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");
const mi = (x, d = 2) => f(Number(x) / 1e6, d);
const sg = (us, d = 2) => f(Number(us) / 1e6, d);
const kib = (k, d = 1) => f(Number(k) / 1024, d);
const N = Number(val[0].n);
const Nf = N.toLocaleString("de-DE");
const c1 = rs.C1, c2 = rs.C2;
const razao = Number(c2.razao_trabalho_por_s_C2_sobre_C1);
const razaoNuvem = Number(nuvem.C2.razao_trabalho_por_s_C2_sobre_C1);
const cpuExtra = (Number(c1.cpu_proc_s_mediana) / Number(c2.cpu_proc_s_mediana) - 1) * 100;
const c2thr = val.filter((r) => r.condicao === "C2" && Number(r.d_nr_throttled) > 0);
const caso = (rot) => ro.split(`== caso ${rot}`)[1].split("== caso")[0].split("# Conferencia")[0];
const linD = (rot) => {
  const t = caso(rot);
  const g = (k) => (t.match(new RegExp(k + "=(\\S+)")) || [])[1];
  return {
    uid: g("uid"), cap: g("capeff"), nnp: g("no_new_privs"),
    mnt: (t.match(/opcoes_mount=(\S+)/) || [])[1],
    lei: (t.match(/leitura=(\w+)/) || [])[1] || "não testada",
    esc: ((t.match(/escrita=([^\n]+)/) || [])[1] || "").replace("negada errno=", "negada, errno "),
  };
};
const d1 = linD("D1_nao_root_ro"), d2 = linD("D2_root_ro"), d3 = linD("D3_nao_root_rw_sem_permissao");
const LT = R("results/linha_do_tempo");
const temLT = fs.existsSync(path.join(LT, "C1.csv")) && fs.existsSync(path.join(LT, "C2.csv"));
function serieLT(cond) {
  const rows = csv(path.join(LT, cond + ".csv")).map((r) => ({ t: +r.t_s, u: +r.usage_usec, thr: +r.nr_throttled, per: +r.nr_periods }));
  const meta = JSON.parse(fs.readFileSync(path.join(LT, cond + ".json"), "utf8"));
  const a = rows[0], b = rows[rows.length - 1];
  return { rows, meta, incl: (b.u - a.u) / 1e6 / (b.t - a.t), thr: b.thr - a.thr, per: b.per - a.per };
}
const lt = temLT ? { C1: serieLT("C1"), C2: serieLT("C2") } : null;
const handle = (rec, col) => ns.find((r) => r.recurso === rec)[col];

// ---------------------------------------------------------------- estilo ABNT
const FONTE = "Times New Roman", MONO = "Courier New";
const LARG = 11906 - 1440 - 1440; // A4 com margens de 2,54 cm, como no relatorio da ATV1
const CORPO = 24, PEQ = 20, LEG = 22; // 12 pt, 10 pt e 11 pt
const LINHA = 276, SIMPLES = 240; // entrelinha 1,15 e simples

function runs(texto, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let i = 0, m;
  while ((m = re.exec(texto))) {
    if (m.index > i) out.push(new TextRun({ text: texto.slice(i, m.index), font: FONTE, size: CORPO, ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), font: FONTE, size: CORPO, ...base, bold: true }));
    else out.push(new TextRun({ text: t.slice(1, -1), font: FONTE, size: CORPO, ...base, font: MONO, size: (base.size || CORPO) - 2 }));
    i = m.index + t.length;
  }
  if (i < texto.length) out.push(new TextRun({ text: texto.slice(i), font: FONTE, size: CORPO, ...base }));
  return out;
}
const P = (t) => new Paragraph({ children: runs(t), alignment: AlignmentType.JUSTIFIED, spacing: { line: LINHA, before: 0, after: 100 } });
const PL = P;
const CENTRO = (t, o = {}) => new Paragraph({ children: runs(t, o.run || {}), alignment: AlignmentType.CENTER, spacing: { line: LINHA, before: o.before || 0, after: o.after || 0 } });
const VAZIO = (n = 1) => Array.from({ length: n }, () => new Paragraph({ children: [new TextRun({ text: "", font: FONTE, size: CORPO })], spacing: { line: LINHA } }));
const B = (t) => new Paragraph({ children: runs(t), numbering: { reference: "marcas", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { line: LINHA, before: 0, after: 60 } });

// titulos no formato da ATV1: "1-Objetivo" e subtitulos em negrito sem numero
const MINUSC = new Set(["de", "do", "da", "dos", "das", "e", "em", "a", "o", "para", "com", "por", "no", "na", "cgroups"]);
const titulo = (t) => t.split(" ").map((w, i) => (i > 0 && MINUSC.has(w)) || !/^[a-zà-ú]/.test(w) ? w : w[0].toUpperCase() + w.slice(1)).join(" ");
let secAtual = 0, nTab = 0, nFig = 0;
function H1(num, t) {
  secAtual = num; nTab = 0; nFig = 0;
  return new Paragraph({ children: [new TextRun({ text: `${num}-${titulo(t)}`, font: FONTE, size: 28, bold: true })], spacing: { line: LINHA, before: 280, after: 120 }, keepNext: true, keepLines: true });
}
function H2(_num, t) {
  const txt = /^Q\d/.test(t) ? t : titulo(t);
  return new Paragraph({ children: [new TextRun({ text: txt, font: FONTE, size: CORPO, bold: true })], spacing: { line: LINHA, before: 160, after: 80 }, keepNext: true, keepLines: true });
}
const proxTab = () => `${secAtual}.${nTab + 1}`;
const proxFig = () => `${secAtual}.${nFig + 1}`;

// legendas como na ATV1: tabela com titulo acima, figura com titulo abaixo, "Fonte: Autor." abaixo
const LEGENDA = (t, o = {}) => new Paragraph({ children: runs(t, { size: LEG, italics: true }), alignment: AlignmentType.CENTER, keepNext: !!o.keepNext, spacing: { line: SIMPLES, before: o.before || 0, after: o.after || 0 } });
const FONTE_AUTOR = (t = "Fonte: Autor.") => LEGENDA(t, { before: 40, after: 200 });

const FINA = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
function GRADE(_tipo, tit, cab, linhas, pesos, o = {}) {
  const leg = `Tabela ${secAtual}.${++nTab}: ${tit}`;
  const soma = pesos.reduce((a, b) => a + b, 0);
  const w = pesos.map((p) => Math.floor((p / soma) * LARG));
  w[w.length - 1] += LARG - w.reduce((a, b) => a + b, 0);
  const cel = (t, j, i) => {
    const cab_ = i < 0;
    return new TableCell({
      width: { size: w[j], type: WidthType.DXA }, borders: { top: FINA, bottom: FINA, left: FINA, right: FINA }, verticalAlign: VerticalAlign.CENTER,
      shading: cab_ ? { type: ShadingType.CLEAR, color: "auto", fill: "D9D9D9" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({ children: runs(String(t), { size: PEQ, bold: cab_ }), spacing: { line: SIMPLES }, alignment: cab_ ? AlignmentType.CENTER : ((o.alin && o.alin[j]) || AlignmentType.CENTER) })],
    });
  };
  return [
    LEGENDA(leg, { before: 160, after: 60, keepNext: true }),
    new Table({
      width: { size: LARG, type: WidthType.DXA }, columnWidths: w,
      rows: [new TableRow({ tableHeader: true, cantSplit: true, children: cab.map((t, j) => cel(t, j, -1)) }),
        ...linhas.map((l, i) => new TableRow({ cantSplit: true, children: l.map((t, j) => cel(t, j, i)) }))],
    }),
    FONTE_AUTOR(o.fonte),
  ];
}
function FIG(tit, arq, wpx, hpx) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(arq), transformation: { width: wpx, height: hpx } })] }),
    LEGENDA(`Figura ${secAtual}.${++nFig}: ${tit}`, { before: 60, keepNext: true }),
    FONTE_AUTOR(),
  ];
}

// ---------------------------------------------------------------- capa (modelo da ATV1, com o logo da UFS)
const capa = [
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new ImageRun({ type: "png", data: fs.readFileSync(R("docs/fonte/ufs_logo.png")), transformation: { width: 122, height: 101 } })] }),
  CENTRO("**Universidade Federal de Sergipe**"),
  CENTRO("Campus de São Cristóvão"),
  CENTRO("Departamento de Computação"),
  ...VAZIO(4),
  CENTRO("COMP0472 - Sistemas Operacionais"),
  CENTRO("Prof. Glauco de Figueiredo Carneiro"),
  ...VAZIO(5),
  CENTRO("**RELATÓRIO DA ATIVIDADE 3 (ATV3)**", { run: { size: 32 } }),
  CENTRO("Virtualização, Contêineres, Namespaces e cgroups", { run: { size: 26 } }),
  ...VAZIO(5),
  CENTRO("Álex Felipe Santos Melo"),
  CENTRO("Matrícula: 202200025395"),
  ...VAZIO(5),
  CENTRO("São Cristóvão - SE"),
  CENTRO("10 de novembro de 2026"),
];

// ---------------------------------------------------------------- texto
const c = [];
c.push(H1(1, "Objetivo"));
c.push(P("Este relatório documenta o laboratório realizado na Atividade 3 da disciplina COMP0472 - Sistemas Operacionais, cujo objetivo é observar, com comandos e dados do próprio kernel, os mecanismos que isolam processos e limitam recursos em contêineres Linux. O trabalho não reconstrói uma aplicação: ele executa um laboratório pequeno e reprodutível com Docker no notebook do discente."));
c.push(P("A pergunta norteadora é: **como namespaces alteram a visão de processos, mounts e rede, e como cgroups limitam recursos sem transformar um contêiner em uma máquina virtual independente?** Especificamente, buscou-se: (1) distinguir VM, hipervisor e contêiner no ambiente efetivamente usado; (2) identificar evidências de namespaces PID, mount e network em dois contêineres; (3) configurar e confirmar quotas de CPU, teto de memória e limite de tarefas, comparando um trabalho fixo sob duas quotas; e (4) demonstrar a negação de escrita em uma montagem somente leitura, relacionando os resultados ao compartilhamento de infraestrutura de inferência."));

c.push(H1(2, "Identificação do discente"));
[["Nome", "Álex Felipe Santos Melo"], ["Matrícula", "202200025395"], ["Curso", "Engenharia de Computação"],
 ["Disciplina", "COMP0472 - Sistemas Operacionais"], ["Professor", "Glauco de Figueiredo Carneiro"],
 ["Semestre", "2026.2"], ["Data de entrega", "10 de novembro de 2026"],
 ["Repositório", "github.com/alexfsmelo/SO_UFS_2026_2_Melo_Alex_ATV3 (commit da entrega: tag `entrega-atv3`)"]]
  .forEach(([k, v]) => c.push(PL(`**${k}:** ${v}`)));

c.push(H1(3, "Materiais e métodos"));
c.push(H2("3.1", "Hardware"));
c.push(P(`Todos os experimentos foram executados no notebook do discente, com CPU AMD Ryzen 7 7735HS (8 núcleos e 16 threads) e 16 GB de RAM instalada. O sistema hospedeiro é o Windows 11, que executa o WSL2 sobre o hipervisor Hyper-V. A VM do WSL2 recebeu ${amb.nproc} CPUs lógicas, ${amb.ram_total.replace(".", ",")} de RAM e 2 GiB de swap.`));
c.push(H2("3.2", "Software"));
c.push(P(`O Linux do WSL2 é o ${(amb.PRETTY_NAME || "").replace(/"/g, "")}, com kernel ${amb.kernel_visto_no_terminal}. O Docker Engine ${(amb.docker_cliente || "").split(" ")[0]} roda dentro do próprio WSL2 (pacote do Ubuntu, sem Docker Desktop), com cgroup v2, driver de cgroup systemd e armazenamento overlayfs; o Docker Compose não está instalado e não foi necessário. A imagem do laboratório é a \`python:3.12-slim\` (Debian 13, Python ${amb.python_na_imagem}), fixada por digest. Os scripts são próprios, equivalentes aos do kit de apoio, e estão na pasta \`lab/\` do repositório.`));
c.push(H2("3.3", "Metodologia de medição"));
c.push(P("Todas as grandezas vêm de arquivos do kernel, nunca de estimativas. Os handles de namespaces foram lidos com `readlink /proc/1/ns/*` dentro dos contêineres e com `/proc/<PID>/status` e `/proc/<PID>/ns/*` no host. Os limites efetivos e os contadores de CPU, memória e tarefas foram lidos pelo próprio processo de carga em `/sys/fs/cgroup` (`cpu.max`, `cpu.stat`, `memory.max`, `memory.swap.max`, `memory.current`, `memory.peak`, `pids.max`), antes e depois do trabalho. O tempo de parede e o tempo de CPU do processo foram medidos com `time.perf_counter()` e `time.process_time()`. Tabelas e gráfico são gerados pelo script `lab/resumo.py` a partir dos registros brutos, e o `lab/validar.py` recalcula as medianas e confere os números deste relatório."));

c.push(H1(4, "Ambiente e contêiner reproduzível - Parte A"));
c.push(H2("4.1", "Ambiente Linux do daemon"));
c.push(P("A Tabela 4.1 reúne o registro do ambiente gerado por `lab/ambiente.sh` (arquivo `results/ambiente/ambiente.txt`). O terminal e o daemon do Docker estão no mesmo Linux, de modo que o `/proc` do terminal é o do host do daemon."));
c.push(...GRADE("quadro", "Ambiente Linux real do daemon", ["Item", "Valor observado", "Evidência"], [
  ["Tipo de ambiente", "WSL2 sobre Hyper-V, no Windows 11", `\`systemd-detect-virt\` = ${amb.systemd_detect_virt}; "${amb.dmesg_hypervisor}"`],
  ["Kernel", amb.kernel_visto_no_terminal, "`uname`; o mesmo valor dentro do contêiner"],
  ["Distribuição", (amb.PRETTY_NAME || "").replace(/"/g, ""), "`/etc/os-release`; PID 1 = systemd"],
  ["CPUs, RAM e swap", `${amb.nproc} CPUs lógicas (${amb.cpu_modelo}), ${amb.ram_total.replace(".", ",")}, 2 GiB de swap`, "`nproc` e `/proc/meminfo`"],
  ["Docker e Compose", `Engine ${(amb.docker_cliente || "").split(" ")[0]}, API ${(amb.docker_cliente || "").split("api=")[1]}; Compose não instalado`, "`docker version` e `docker compose version`"],
  ["cgroup", `v${(amb.Cgroup || "").split(" ")[0]}, driver ${((amb.Cgroup || "").split("Driver=")[1] || "").trim()}`, "`docker info`; `/sys/fs/cgroup` do tipo cgroup2fs"],
  ["Controladores", amb.controladores_raiz, "`cgroup.controllers` na raiz"],
  ["Segurança do daemon", "seccomp padrão e cgroup namespace privado", "`docker info`, campo SecurityOptions"],
], [1.2, 2.2, 2.6]));
c.push(H2("4.2", "VM, hipervisor e contêiner"));
c.push(P(`No ambiente usado há uma VM entre o hardware e o kernel Linux: o Hyper-V, hipervisor do Windows, executa a VM leve do WSL2, que tem seu próprio kernel Linux ${amb.kernel_visto_no_terminal}. Essa VM é uma só para todo o ambiente. Os contêineres não ganham VM nem kernel próprios: são processos desse kernel, criados pelo \`runc\` com namespaces novos e colocados em cgroups próprios. A Figura 4.1 mostra as camadas. O comando \`uname -r\` devolve o mesmo valor no terminal e dentro do contêiner, o que confirma o kernel compartilhado.`));
c.push(...FIG("Camadas do ambiente: notebook, Windows 11 com Hyper-V, VM do WSL2 com um único kernel Linux, Docker e os contêineres das Partes B, C e D", R("docs/diagrama_camadas.png"), 580, 380));
c.push(H2("4.3", "cgroup v2 e controladores"));
c.push(P(`O WSL2 usa cgroup v2 unificado, que é a versão pressuposta pelo roteiro. Os controladores necessários estão disponíveis e habilitados para os filhos da raiz (\`subtree_control\`: ${amb.subtree_control_raiz}). Não há limites ancestrais: em \`/sys/fs/cgroup/system.slice\`, onde o systemd cria os escopos dos contêineres, \`cpu.max\` vale \`max 100000\` e \`memory.max\` e \`pids.max\` valem \`max\`. O daemon roda como root, sem modo rootless.`));
c.push(H2("4.4", "Imagem e parâmetros fixados"));
c.push(P(`A imagem foi obtida com \`docker pull python:3.12-slim\` e fixada pelo digest \`${par.imagem}\`, criado em ${(amb.criada || "").slice(0, 10).split("-").reverse().join("/")}. Os parâmetros das execuções estão em \`results/raw/execucoes/parametros.txt\`: N = ${Nf} iterações, memória de 256 MiB, memória mais swap de 256 MiB, \`--pids-limit 64\`, usuário 65534, \`--cap-drop ALL\`, \`no-new-privileges\` e \`--network none\`. O código é identificado pelo hash sha256 de cada script, registrado em \`ambiente.txt\`, e pela tag \`entrega-atv3\` do repositório.`));

c.push(H1(5, "Evidências de namespaces - Parte B"));
c.push(P(`O script \`lab/evidencia_ns_mount.sh\` sobe dois contêineres independentes da mesma imagem (\`${regA.nome}\` e \`${regB.nome}\`), ambos com \`sleep 300\` como processo principal e sem rede. Com os dois ativos, coleta o PID informado por \`docker inspect\`, o comando do PID 1 interno, os handles de \`/proc/1/ns/*\` e, pelo \`/proc\` do host, a linha \`NSpid\` e os mesmos handles. A Tabela 5.1 resume os dois registros reais.`));
c.push(...GRADE("quadro", "Registros dos dois contêineres", ["Campo", "Contêiner A", "Contêiner B"], [
  ["PID no host (`docker inspect`)", regA.PID_host, regB.PID_host],
  ["PID 1 interno (`/proc/1/comm`)", regA.pid1_comm, regB.pid1_comm],
  ["`NSpid` lido no host", regA.host_NSpid, regB.host_NSpid],
  ["Processos visíveis dentro", "PID 1 (sleep) e o próprio `docker exec`", "PID 1 (sleep) e o próprio `docker exec`"],
  ["Interfaces de rede dentro", regA.interfaces_rede_dentro, regB.interfaces_rede_dentro],
  ["Raiz do mount namespace", `overlay própria, ${regA.total_mounts_dentro} montagens`, `overlay própria, ${regB.total_mounts_dentro} montagens`],
], [1.6, 2, 2]));
const interp = {
  pid: "Árvores de PID separadas: cada contêiner numera seus processos a partir de 1 e não vê os do outro nem os do host.",
  mnt: "Tabelas de montagem separadas: cada um tem sua raiz overlay; montar algo em A não aparece em B.",
  net: "Pilhas de rede separadas: com `--network none`, cada um tem só o seu `lo`; o host tem `eth0` e `docker0`.",
  uts: "Hostnames independentes (o ID curto de cada contêiner).",
  ipc: "Filas, semáforos e memória compartilhada System V separados.",
  cgroup: "Separado: em cgroup v2 o Docker cria um cgroup namespace privado, e o contêiner vê o próprio cgroup como raiz.",
};
c.push(...GRADE("quadro", "Comparação dos handles de namespaces", ["Recurso", "Handle em A", "Handle em B", "Iguais?", "Interpretação"],
  ns.map((r) => [r.recurso, r.handle_A, r.handle_B, r.iguais, interp[r.recurso]]), [0.7, 1.35, 1.35, 0.55, 3.2],
  { fonte: `Fonte: Autor. O terminal do host tem ${regH.ns_pid}, ${regH.ns_mnt} e ${regH.ns_net}.` }));
c.push(P(`Os handles de PID, mount e rede são diferentes entre A, B e o terminal do host, e o comportamento confirma a separação: cada contêiner vê só o seu PID 1, tem a própria raiz de arquivos e enxerga apenas a interface \`lo\`. Os handles lidos pelo host em \`/proc/${regA.PID_host}/ns/*\` são idênticos aos lidos dentro de A, o que mostra que se trata do mesmo processo visto de dois lugares.`));
c.push(P(`**Como os dois podem ter PID 1.** Um namespace de PID é uma tabela de numeração. Quando o \`runc\` cria o contêiner, o primeiro processo do namespace novo recebe o número 1 nessa tabela e continua tendo um número na tabela do namespace pai [PIDNS]. A linha \`NSpid: ${regA.host_NSpid}\` do \`/proc/${regA.PID_host}/status\` mostra exatamente isso: é a mesma tarefa do kernel, com o número ${regA.PID_host} no host e 1 dentro de A. O contêiner B tem outro processo (${regB.PID_host} no host), que também é 1 no seu próprio namespace. São dois processos diferentes, com números iguais em tabelas diferentes.`));
c.push(P("**O que os handles não demonstram.** Handles diferentes mostram visões separadas, não isolamento completo. Não mostram que o kernel é outro (é o mesmo), nem limite de recursos (papel do cgroup), nem separação de identidade: não foi usado user namespace, então o UID 0 dentro de um contêiner é o UID 0 do host. Também não provam ausência de canais laterais. Além disso, o número do handle é o inode do namespace e só identifica o namespace enquanto ele existe; o kernel pode reutilizá-lo depois."));
c.push(P("**Tentativa preservada.** A primeira coleta foi feita com o usuário comum, que não tem permissão para ler os links `/proc/<PID>/ns/*` de processos do root; o script registrou erroneamente \"daemon remoto\". O registro foi preservado em `results/namespaces/tentativa1_sem_root/`, o script foi corrigido para informar o motivo real e a coleta foi refeita como root."));

c.push(H1(6, "Configuração do experimento de cgroups - Parte C"));
c.push(P("Todas as execuções da Parte C foram feitas na mesma sessão, em 10/11/2026, sem reiniciar o sistema entre as condições."));
c.push(PL(`**Carga:** \`lab/carga_cpu.py\` executa N iterações de um gerador congruente linear de 64 bits e acumula cada valor num checksum. O mesmo N sempre gera o mesmo checksum, e pular ou repetir trabalho o altera. Para N = ${Nf}, o checksum \`${refChk}\` foi recalculado fora do contêiner, sem limites, e coincide com as seis execuções.`));
c.push(PL(`**Piloto:** com N = ${Number(piloto.C1.n).toLocaleString("de-DE")}, C1 levou ${f(piloto.C1.wall_s)} s e C2, ${f(piloto.C2.wall_s)} s. N = ${Nf} foi escolhido para que C1 durasse cerca de 25 s, abaixo do limite interno de 60 s, e então congelado nas seis execuções.`));
c.push(PL("**Ordem:** alternada em ABBA (C1 C2, C2 C1, C1 C2), para que uma variação lenta do host não favorecesse sempre a mesma condição."));
c.push(PL("**Confirmação dos limites:** a flag pedida não prova o limite. O processo de carga lê o próprio cgroup antes e depois do trabalho e grava os valores efetivos e os deltas de `cpu.stat`; o `docker inspect` fica registrado à parte, como valor pedido."));
c.push(PL("**Segurança:** limite interno de 60 s, `timeout 90` no host, contêiner sem rede, usuário 65534, sem capabilities e com `no-new-privileges`."));

c.push(H1(7, "Experimentos realizados"));
c.push(H2("7.1", "C1: quota de 0,5 CPU"));
c.push(P("`--cpus 0.5`, 256 MiB de memória, memória mais swap de 256 MiB e `--pids-limit 64`, com três repetições. Mede o tempo e a vazão do trabalho fixo quando o cgroup pode usar 50 ms de CPU a cada período de 100 ms."));
c.push(H2("7.2", "C2: quota de 1,0 CPU"));
c.push(P("`--cpus 1.0`, com os mesmos limites de memória e tarefas, a mesma imagem e o mesmo trabalho, também com três repetições. Mede o efeito de dobrar a quota."));

c.push(H1(8, "Resultados"));
c.push(H2("8.1", "Tabela consolidada"));
c.push(P("A Tabela 8.1 apresenta as seis execuções principais, na ordem real. Todas terminaram com status ok, código de saída 0 e o checksum de referência."));
c.push(...GRADE("tabela", "Execuções válidas da Parte C (N = " + Nf + ")",
  ["Ordem", "Condição", "Rep.", "Parede (s)", "CPU do processo (s)", "Trabalho (M it/s)", "cpu.max", "Throttled / períodos", "Throttled (s)"],
  val.map((r) => [r.ordem, r.condicao, r.rep, f(r.wall_s, 3), f(r.cpu_proc_s, 3), mi(r.trabalho_por_s, 3), r.cpu_max, `${r.d_nr_throttled} / ${r.d_nr_periods}`, sg(r.d_throttled_usec, 3)]),
  [0.75, 0.95, 0.5, 0.85, 1, 0.95, 1.2, 1.05, 0.85]));
c.push(H2("8.2", "Medianas por condição"));
c.push(...GRADE("tabela", "Mediana e variação por condição (n = 3)",
  ["Condição", "Parede mediana (s)", "Trabalho mediano (M it/s)", "Mínimo a máximo (M it/s)", "Amplitude", "CPU efetiva (CPUs)", "Throttled mediano (s)"], [
  ["C1 (0,5 CPU)", f(c1.wall_s_mediana), mi(c1.trabalho_por_s_mediana), `${mi(c1.trabalho_por_s_min)} a ${mi(c1.trabalho_por_s_max)}`, f(c1.trabalho_por_s_amplitude_pct, 1) + "%", f(c1.cpu_efetiva_media_mediana, 3), sg(c1.d_throttled_usec_mediana)],
  ["C2 (1,0 CPU)", f(c2.wall_s_mediana), mi(c2.trabalho_por_s_mediana), `${mi(c2.trabalho_por_s_min)} a ${mi(c2.trabalho_por_s_max)}`, f(c2.trabalho_por_s_amplitude_pct, 1) + "%", f(c2.cpu_efetiva_media_mediana, 3), sg(c2.d_throttled_usec_mediana)],
], [1.1, 0.95, 1.1, 1.15, 0.95, 0.85, 0.95],
  { fonte: "Fonte: Autor. Amplitude = (máximo - mínimo) / mediana. CPU efetiva = delta de usage_usec / tempo de parede." }));
c.push(P(`A razão entre as medianas de trabalho por segundo foi **${f(razao)}** (C2 / C1). Em C1, o cgroup consumiu ${f(c1.cpu_efetiva_media_mediana, 3)} CPU em média e sofreu throttling em todos os períodos de 100 ms. Em C2, consumiu ${f(c2.cpu_efetiva_media_mediana, 3)} CPU${c2thr.length ? `; apenas a repetição ${c2thr.map((r) => r.rep).join(", ")} registrou throttling, em ${c2thr.map((r) => r.d_nr_throttled).join(", ")} de ${c2thr.map((r) => r.d_nr_periods).join(", ")} períodos, somando ${c2thr.map((r) => f(Number(r.d_throttled_usec) / 1000, 1)).join(", ")} ms, valor desprezível frente aos ${f(c2.wall_s_mediana)} s de execução` : " e não sofreu throttling"}.`));
c.push(H2("8.3", "Gráfico comparativo"));
c.push(...FIG("Trabalho concluído por segundo e decomposição do tempo de parede em C1 e C2 (n = 3 repetições por condição)", R("results/figuras/c1_c2.png"), 600, 251));
c.push(H2("8.4", "CPU usada contra a quota"));
c.push(P(`A Figura ${proxFig()} mostra, para cada execução, a CPU efetiva do cgroup (delta de \`usage_usec\` dividido pelo tempo de parede) contra a quota pedida. As três execuções de C1 ficaram entre ${f(c1.cpu_efetiva_media_min, 3)} e ${f(c1.cpu_efetiva_media_max, 3)} CPU, e as de C2 entre ${f(c2.cpu_efetiva_media_min, 3)} e ${f(c2.cpu_efetiva_media_max, 3)}: o kernel entregou exatamente o que a quota permite, com diferença na terceira casa decimal.`));
c.push(...FIG("CPU efetiva de cada execução contra a quota pedida (n = 3 por condição)", R("results/figuras/cpu_x_quota.png"), 560, 261));
const secMem = "8.5";
c.push(H2(secMem, "Memória e tarefas"));
c.push(P(`Os limites de memória e tarefas foram confirmados em todas as execuções: \`memory.max\` = 256 MiB, \`memory.swap.max\` = 0 (o equivalente a memória mais swap de 256 MiB) e \`pids.max\` = 64, com \`pids.current\` = ${val[0].pids_current}. A carga é pequena em memória e não se aproximou do teto, e o laboratório não forçou falta de memória. A Tabela 8.3 separa três medidas que não são a mesma coisa.`));
c.push(...GRADE("tabela", "Medidas de memória por condição (mediana)", ["Medida", "C1", "C2", "O que representa"], [
  ["RSS do processo", kib(c1.rss_kib_mediana) + " MiB", kib(c2.rss_kib_mediana) + " MiB", "Páginas residentes do processo, incluindo bibliotecas compartilhadas"],
  ["memory.current do grupo", kib(c1.memory_current_kib_mediana) + " MiB", kib(c2.memory_current_kib_mediana) + " MiB", "Memória cobrada do cgroup no instante da leitura"],
  ["memory.peak do grupo", kib(c1.memory_peak_kib_mediana) + " MiB", kib(c2.memory_peak_kib_mediana) + " MiB", "Maior valor cobrado desde a criação do cgroup"],
], [1.4, 0.7, 0.7, 3], { alin: [AlignmentType.LEFT, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.LEFT] }));
c.push(P("O RSS é maior que o pico do grupo porque o kernel cobra cada página de cache de arquivo do cgroup que a tocou primeiro [CG]. Parte das páginas do interpretador e das bibliotecas entra no RSS do processo sem ser cobrada do contêiner. Nenhum desses números é \"RAM média\"."));

c.push(H1(9, "Montagem somente leitura e menor privilégio - Parte D"));
c.push(P("O diretório sintético `dados_demo/`, com um arquivo `texto.txt` contendo \"Documento sintetico\", foi montado como `/dados:ro`. Para separar os mecanismos, foram executados três casos, todos sem `--privileged` e sem rede. O teste de escrita usa `open(..., \"x\")` em Python, que devolve o código de erro exato do kernel. A Tabela 9.1 resume os resultados de `results/mount/readonly.txt`."));
c.push(...GRADE("quadro", "Casos de leitura e escrita na montagem", ["Caso", "Identidade", "Montagem", "Leitura", "Escrita", "Mecanismo que negou"], [
  ["D1", `uid ${d1.uid}, CapEff ${d1.cap}, no_new_privs ${d1.nnp}`, `/dados ${d1.mnt}`, d1.lei, d1.esc, "Flag read-only da montagem"],
  ["D2", `uid ${d2.uid} (root), CapEff ${d2.cap}`, `/dados ${d2.mnt}`, d2.lei, d2.esc, "A mesma flag: nem root escreve"],
  ["D3", `uid ${d3.uid}, CapEff ${d3.cap}, no_new_privs ${d3.nnp}`, `/controle ${d3.mnt}`, d3.lei, d3.esc, "Permissão do diretório (0755, dono 1000)"],
], [0.45, 1.65, 0.95, 0.6, 1.5, 1.45], { fonte: "Fonte: Autor. Depois dos testes, `dados_demo` contém só `texto.txt` e o diretório de controle está vazio." }));
c.push(P("D1 é o teste pedido: leitura bem-sucedida e escrita negada com **EROFS** (Read-only file system), por um usuário não root, sem nenhuma capability e com `no_new_privs`. D2 mostra que a negação vem da **montagem**, não da identidade: root, com as capabilities padrão do Docker, recebe o mesmo EROFS. D3 mostra outro mecanismo: com a montagem gravável, a escrita é negada com **EACCES** pelas permissões do diretório."));
c.push(P("Os conceitos ficam separados assim: o **mount namespace** define quais montagens o contêiner enxerga [MNTNS]; a **montagem read-only** é uma flag dessa montagem, verificada pelo kernel antes das permissões; as **permissões** comparam UID e modo do arquivo; e as **proteções do kernel** (capabilities zeradas, `no_new_privs` e filtro seccomp) reduzem o que o processo pode tentar para contornar as anteriores [CAP]. A negação de escrita não prova isolamento absoluto: o processo ainda lê tudo o que foi montado, e um defeito no kernel continuaria afetando todos os contêineres."));

if (!temLT) throw new Error("results/linha_do_tempo ausente");
function janelas(sr) {
  const r = sr.rows, out = [];
  let j = 0;
  for (let i = 0; i < r.length; i++) {
    while (r[i].t - r[j].t > 1.0) j++;
    if (r[i].t - r[j].t >= 0.95) out.push((r[i].u - r[j].u) / 1e6 / (r[i].t - r[j].t));
  }
  return [Math.min(...out), Math.max(...out)];
}
const [jMin, jMax] = janelas(lt.C1);
c.push(H1(10, "Experimento extra: linha do tempo do throttling"));
c.push(P("Este experimento não é exigido pelo enunciado. Foi feito por iniciativa do discente, depois das seis execuções principais, para responder a uma pergunta que elas não respondem e para gerar uma evidência visual do mecanismo de quota."));
c.push(H2("10.1", "Por que este teste foi feito"));
c.push(P("As execuções da Parte C leem o `cpu.stat` só no início e no fim do trabalho. Elas provam que a quota foi aplicada e quanto tempo o processo ficou em throttling, mas não mostram como isso acontece ao longo da execução. Duas hipóteses dariam o mesmo total: o kernel poderia deixar o processo mais lento de forma contínua, como se a CPU tivesse metade da velocidade, ou poderia deixá-lo rodar em velocidade plena e pausá-lo quando a quota do período acabasse. A diferença importa para entender a afirmação do enunciado de que a quota é tempo agregado por período, e não reserva de núcleo, e importa na prática: num servidor de inferência, pausas de dezenas de milissegundos aparecem como variação de latência para o usuário. O teste também confere a medição principal por outro caminho, lendo o cgroup pelo host em vez de dentro do contêiner."));
c.push(H2("10.2", "Como foi feito"));
c.push(P(`O script \`lab/linha_do_tempo.py\` executou a mesma carga (N = ${Nf}) uma vez em C1 e uma vez em C2, com os mesmos limites e flags da Parte C, e leu o \`cpu.stat\` do cgroup do contêiner pelo host a cada ${f(lt.C1.meta.intervalo_s * 1000, 0)} ms, num total de ${lt.C1.rows.length} leituras em C1 e ${lt.C2.rows.length} em C2. O caminho do cgroup vem de \`/proc/<PID>/cgroup\`, e a leitura pelo host não consome CPU do próprio contêiner. Por ser uma execução única por condição, este teste não entra nas medianas da seção 8.`));
c.push(H2("10.3", "Resultados"));
c.push(P(`Na Figura ${proxFig()}, a CPU acumulada pelo cgroup cresce em linha reta, com inclinação ${f(lt.C1.incl, 3)} em C1 e ${f(lt.C2.incl, 3)} em C2, iguais às quotas; em qualquer janela de 1 s, C1 usou entre ${f(jMin)} e ${f(jMax)} CPU. Em C1, ${lt.C1.thr} dos ${lt.C1.per} períodos registrados tiveram throttling; em C2, ${lt.C2.thr} de ${lt.C2.per}. O detalhe de 1 s de C1 mostra a CPU chegando em degraus, e não de forma contínua.`));
c.push(...FIG("CPU acumulada ao longo do tempo em C1 e C2 e detalhe de 1 s de C1 (experimento extra)", R("results/figuras/linha_do_tempo.png"), 600, 240));
c.push(P(`Nesta rodada, o mesmo trabalho gastou mais tempo de CPU que nas execuções principais (${f(lt.C1.meta.carga.cpu_proc_s)} s em C1 e ${f(lt.C2.meta.carga.cpu_proc_s)} s em C2, contra medianas de ${f(c1.cpu_proc_s_mediana)} s e ${f(c2.cpu_proc_s_mediana)} s), e por isso os tempos de parede foram maiores (${f(lt.C1.meta.carga.wall_s)} s e ${f(lt.C2.meta.carga.wall_s)} s). O notebook estava mais lento naquele momento, possivelmente por estado de energia ou temperatura, o que não foi medido. Como a quota é proporcional ao tempo, a inclinação não muda, e as duas execuções terminaram com o checksum de referência ${lt.C1.meta.carga.checksum === refChk && lt.C2.meta.carga.checksum === refChk ? "conferido" : "DIVERGENTE"}.`));
c.push(H2("10.4", "O que o teste mostra"));
c.push(P("A quota não deixa a CPU mais lenta: ela liga e desliga o processo. Em média o contêiner de C1 recebe exatamente 0,5 CPU, mas localmente ele roda em velocidade plena até gastar os 50 ms do período e espera o período seguinte [BWC]. Isso confirma que a quota é um orçamento por período, e não um núcleo reservado nem uma CPU mais lenta. Em C2, a inclinação 1,0 sem nenhum throttling confirma que a carga de uma thread nunca passa de uma CPU. Como limitações, a leitura a cada 20 ms não resolve cada período de 100 ms individualmente (os degraus aparecem com 20 a 30 ms), e há uma única execução por condição."));

c.push(H1(11, "Análise dos resultados"));
c.push(H2("11.1", "Q1 - Onde está o kernel compartilhado? Há uma VM intermediária?"));
c.push(P(`O kernel compartilhado é o Linux ${amb.kernel_visto_no_terminal} da VM do WSL2: \`uname -r\` devolve o mesmo valor no terminal e dentro do contêiner, e os processos dos contêineres aparecem no \`/proc\` do host com PIDs comuns (${regA.PID_host} e ${regB.PID_host}). Existe uma VM intermediária, criada pelo Hyper-V para o WSL2, mas ela é do ambiente e não de cada contêiner: todos os contêineres dividem a mesma VM e o mesmo kernel.`));
c.push(H2("11.2", "Q2 - Quais diferenças de handles sustentam a separação de PID, mount e network? O que elas não demonstram?"));
c.push(P("Os handles `pid`, `mnt` e `net` diferem entre A, B e o terminal (Tabela 5.2), e as observações batem com isso: cada contêiner vê só o próprio PID 1, tem raiz overlay própria e apenas a interface `lo`. Os handles não demonstram kernel separado, limite de recursos, separação de usuários (sem user namespace, root dentro é root fora) nem ausência de canais laterais [NS]."));
c.push(H2("11.3", "Q3 - Como diferenciar namespace, cgroup, identidade e política de acesso?"));
c.push(B("**Namespace** muda o que o processo vê: PIDs, montagens, rede e hostname."));
c.push(B("**cgroup** muda quanto ele pode consumir: CPU por período, memória e número de tarefas [CG]."));
c.push(B(`**Identidade** é quem ele é para o kernel: UID, GID e capabilities (uid ${d1.uid} com CapEff zerado em D1; uid 0 com CapEff ${d2.cap} em D2).`));
c.push(B("**Política de acesso** decide o que ele pode fazer com o que vê: flags de montagem, permissões de arquivo, seccomp e `no_new_privs`. Os casos D1 a D3 mostram três dessas camadas agindo em separado."));
c.push(H2("11.4", "Q4 - Como a quota foi confirmada? Houve throttling?"));
c.push(P(`A quota foi lida no cgroup do próprio processo: \`cpu.max = 50000 100000\` em C1 e \`100000 100000\` em C2, isto é, 50 ms ou 100 ms de CPU a cada período de 100 ms, somados entre todas as CPUs do grupo. É tempo agregado por período, não afinidade com um núcleo nem reserva [BWC]. Houve throttling em C1 em 100% dos períodos (${c1.d_nr_throttled_min} a ${c1.d_nr_throttled_max} por execução), com ${sg(c1.d_throttled_usec_mediana)} s de espera mediana. Os contadores fecham com o tempo e o trabalho: em C1, CPU consumida (${f(c1.cpu_proc_s_mediana)} s) mais tempo em throttling (${sg(c1.d_throttled_usec_mediana)} s) dá aproximadamente o tempo de parede (${f(c1.wall_s_mediana)} s), e a CPU efetiva é ${f(c1.cpu_efetiva_media_mediana, 3)}, o valor da quota. Em C2 o throttling foi praticamente nulo porque a carga tem uma única thread e não consegue usar mais de uma CPU: a quota de 1,0 só foi alcançada, ocasionalmente, no limite de alguns períodos. A conclusão vale para as três repetições, não para uma amostra isolada.`));
c.push(H2("11.5", "Q5 - O que aconteceu com mediana e variação entre C1 e C2? Qual é a principal ameaça à validade?"));
c.push(P(`A mediana de trabalho por segundo foi ${mi(c1.trabalho_por_s_mediana)} M it/s em C1 e ${mi(c2.trabalho_por_s_mediana)} M it/s em C2, razão de ${f(razao)}. A variação foi pequena nas duas condições (amplitude de ${f(c1.trabalho_por_s_amplitude_pct, 1)}% e ${f(c2.trabalho_por_s_amplitude_pct, 1)}%). A razão ficou muito perto de 2: o mesmo trabalho gastou só ${f(cpuExtra, 1)}% mais tempo de CPU em C1 (${f(c1.cpu_proc_s_mediana)} s contra ${f(c2.cpu_proc_s_mediana)} s). Na execução preliminar em nuvem (seção 12.2), essa diferença foi maior e a razão chegou a ${f(razaoNuvem)}, o que sugere que o ruído de um host compartilhado pesa mais que o próprio mecanismo; com três amostras, porém, não é possível afirmar a causa. A principal ameaça à validade é o ruído do host: o notebook executa o Windows e outros processos ao mesmo tempo que a VM do WSL2. Também pesam o n = 3 e a carga de thread única, que torna C2 equivalente a \"sem limite\" para este programa.`));
c.push(P(`A Figura ${proxFig()} compara os dois ambientes: a vazão absoluta muda com a máquina e com a versão do Python, mas a razão C2 / C1 fica perto de 2 nos dois.`));
c.push(...FIG("Vazão mediana e razão C2 / C1 no notebook e na execução preliminar em nuvem", R("results/figuras/notebook_x_nuvem.png"), 600, 240));
c.push(H2("11.6", "Q6 - Por que limitar RAM e tarefas e montar o corpus read-only importa em um servidor de inferência? Que risco permanece?"));
c.push(P("Num servidor que atende vários usuários ou modelos, o teto de memória impede que uma requisição grande ou um vazamento derrube os vizinhos por falta de RAM; o limite de tarefas impede que um tokenizador, um pool de threads ou um defeito criem processos sem fim; a quota de CPU reparte o processador de forma previsível [RES]; e o corpus do RAG montado como somente leitura impede que um processo comprometido, por exemplo por injeção de prompt que aciona ferramentas, altere os documentos que respondem a todos. Permanecem riscos: o kernel é compartilhado, então uma falha nele atravessa os contêineres; o cgroup de memória não limita VRAM de GPU; a leitura continua permitida, então dados sensíveis montados podem vazar; sem user namespace, root no contêiner é root no host em caso de fuga; e a vazão de disco não foi limitada. O isolamento não dispensa manter kernel e runtime atualizados."));

c.push(H1(12, "Segurança e limitações"));
c.push(H2("12.1", "Segurança"));
c.push(B("Carga limitada a 60 s dentro do contêiner e a 90 s no host com GNU `timeout`; a execução mais longa durou cerca de 26 s."));
c.push(B("Contêineres sem rede, com usuário 65534, sem capabilities e com `no-new-privileges`, exceto o caso D2, que usa root de propósito para mostrar que a montagem read-only vale também para ele, sem `--privileged`."));
c.push(B("Nenhuma escrita manual em `/sys`, fork bomb, falta de memória deliberada, escalonador de tempo real ou teste fora do próprio notebook."));
c.push(B("Montados apenas `dados_demo/` e um diretório de controle vazio, nunca `/`, a home, o socket do Docker ou pastas sigilosas. Os scripts removem só os contêineres que criaram."));
c.push(B("Registros revisados: `ambiente.txt` usa campos formatados de `docker info`, sem hostname nem usuário, e o registro da Parte D troca o caminho do repositório por `<repo>`."));
c.push(H2("12.2", "Limitações e execução preliminar"));
c.push(B("Três repetições por condição sustentam mediana e amplitude, não inferência estatística."));
c.push(B("A carga é de uma thread; com várias threads, C2 também sofreria throttling e a comparação mudaria."));
c.push(B("O WSL2 limita a VM a 4 CPUs lógicas, das 16 do notebook; os resultados absolutos valem para essa configuração."));
c.push(B(`Antes da execução no notebook, o assistente de IA fez uma execução preliminar em uma VM de nuvem (KVM e Firecracker, cgroup v1 e imagem Ubuntu 24.04 com Python 3.12 construída a partir do repositório oficial, porque o Docker Hub estava bloqueado). Os dados estão preservados em \`results_vm_nuvem/\` e não entram na análise principal. Lá, C1 levou ${f(nuvem.C1.wall_s_mediana)} s e C2 ${f(nuvem.C2.wall_s_mediana)} s, com razão ${f(razaoNuvem)}: o mesmo comportamento em outro hardware e outra versão de cgroup.`));

c.push(H1(13, "Conclusão"));
c.push(P(`Os experimentos respondem à pergunta norteadora. Os namespaces separaram a visão de processos, montagens e rede: dois contêineres da mesma imagem têm handles diferentes, cada um vê apenas o próprio PID 1, e o mesmo processo aparece como ${regA.PID_host} no host e 1 dentro do contêiner. Os cgroups limitaram de fato o consumo: com \`cpu.max = 50000 100000\`, o contêiner usou ${f(c1.cpu_efetiva_media_mediana, 3)} CPU, sofreu throttling em todos os períodos e levou ${f(c1.wall_s_mediana)} s para o mesmo trabalho que C2 fez em ${f(c2.wall_s_mediana)} s, uma razão de ${f(razao)}. Tudo isso aconteceu sobre um único kernel Linux, o da VM do WSL2, sem nenhuma VM por contêiner. O experimento extra acrescentou como esse limite age no tempo: em vez de deixar a CPU mais lenta, o kernel liga e desliga o processo dentro de cada período de 100 ms.`));
c.push(P("A montagem read-only negou escrita até para root, com um erro diferente do erro de permissão, o que mostra que montagem, identidade e permissões são camadas distintas. Para um servidor de inferência, esses mecanismos permitem dividir uma máquina entre usuários com limites previsíveis e proteger o corpus, mas não substituem a atualização do kernel e do runtime nem resolvem o compartilhamento de GPU."));

c.push(H1(14, "Declaração de uso de inteligência artificial"));
c.push(P("Declaro que conduzi esta atividade e utilizei a ferramenta de inteligência artificial Claude (Anthropic, identificador `claude-opus-5-5`) como assistente. Decidi executar o laboratório no meu notebook, no WSL2 com Docker, e executei todas as medições analisadas neste relatório: o registro do ambiente, as evidências de namespaces (refazendo a coleta como root para registrar o `NSpid`), o teste read-only, o piloto, as seis execuções C1/C2 e o experimento extra da seção 10, que escolhi para ter mais evidências gráficas. Também defini o formato do relatório e dos slides e sou responsável pela revisão final."));
c.push(P("A IA me auxiliou a estruturar a ideia do laboratório a partir do enunciado, a escrever os scripts da pasta `lab/`, a confirmar a execução de cada etapa (conferindo os registros, o checksum e os limites efetivos) e na redação inicial deste relatório e dos slides. Ela também fez uma execução preliminar em nuvem, preservada em `results_vm_nuvem/` e usada só como conferência. Nenhuma saída de IA foi apresentada como medição: os números vêm dos arquivos do kernel coletados no meu notebook. Os detalhes, os prompts relevantes e os erros corrigidos estão em `DECLARACAO_IA.md`."));
c.push(PL("**Link do repositório:** https://github.com/alexfsmelo/SO_UFS_2026_2_Melo_Alex_ATV3"));
c.push(PL("**Link do vídeo:** PREENCHER"));

c.push(H1(15, "Referências"));
[
  "[NS] Linux man-pages. namespaces(7). https://man7.org/linux/man-pages/man7/namespaces.7.html",
  "[PIDNS] Linux man-pages. pid_namespaces(7). https://man7.org/linux/man-pages/man7/pid_namespaces.7.html",
  "[MNTNS] Linux man-pages. mount_namespaces(7). https://man7.org/linux/man-pages/man7/mount_namespaces.7.html",
  "[CAP] Linux man-pages. capabilities(7). https://man7.org/linux/man-pages/man7/capabilities.7.html",
  "[CG] Linux Kernel Documentation. Control Group v2. https://docs.kernel.org/admin-guide/cgroup-v2.html",
  "[BWC] Linux Kernel Documentation. CFS Bandwidth Control. https://docs.kernel.org/scheduler/sched-bwc.html",
  "[RES] Docker. Resource constraints. https://docs.docker.com/engine/containers/resource_constraints/",
].forEach((r) => c.push(new Paragraph({ children: runs(r), alignment: AlignmentType.LEFT, spacing: { line: LINHA, after: 80 } })));

// ---------------------------------------------------------------- documento (margens de 2,54 cm, sem numeracao, como na ATV1)
const pagina = { size: { width: 11906, height: 16838 }, margin: { top: 1440, left: 1440, bottom: 1440, right: 1440 } };
const doc = new Document({
  creator: "Álex Felipe Santos Melo",
  title: "Relatório da Atividade 3 (ATV3): virtualização, contêineres, namespaces e cgroups",
  styles: { default: { document: { run: { font: FONTE, size: CORPO } } } },
  numbering: { config: [{ reference: "marcas", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 709, hanging: 283 } } } }] }] },
  sections: [
    { properties: { page: pagina }, children: capa },
    { properties: { type: SectionType.NEXT_PAGE, page: pagina }, children: c },
  ],
});
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(R("docs/relatorio_ATV3_SO_Alex_Melo.docx"), buf);
  console.log("ok");
});
