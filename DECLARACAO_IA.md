# Declaração de uso crítico de IA generativa

**Discente:** Álex Felipe Santos Melo, matrícula 202200025395. **Atividade 3**, COMP0472 - Sistemas Operacionais, UFS 2026.2.

## Ferramenta e modelo

Claude (Anthropic), em sessão de agente com terminal Linux, identificador de modelo configurado `claude-opus-5-5`, usado em 10/11/2026 como assistente. O mesmo assistente me apoiou nas Atividades 1 e 2.

## Como conduzi o trabalho

* Decidi rodar o laboratório no meu notebook (WSL2, Docker Engine 29.1.3, cgroup v2), que é o ambiente que eu já tinha disponível, como pede o enunciado, em vez de ficar só com a execução preliminar feita em nuvem.
* Preparei o Docker no WSL2 (permissão do usuário no grupo `docker`) e executei todas as medições analisadas no relatório: registro do ambiente, evidências de namespaces, teste read-only, piloto e as seis execuções C1/C2.
* Refiz a coleta de namespaces como root para registrar o `NSpid`, preservando a primeira tentativa.
* Pedi mais comparações gráficas e escolhi o que comparar: CPU usada contra a quota, notebook contra a execução preliminar e o experimento extra da linha do tempo, que também executei no notebook.
* Defini o formato das entregas (relatório no modelo da ATV1 com o logo da UFS, slides no modelo da ATV1 com fundo claro) e sou responsável pela revisão final, pela apresentação e pelo vídeo.

## Como a IA me auxiliou

* A estruturar a ideia do laboratório a partir do enunciado: carga com trabalho fixo verificável por checksum, piloto antes de congelar N, ordem alternada e leitura do limite efetivo no kernel.
* A escrever os scripts da pasta `lab/`, equivalentes ao kit de apoio, que não estava disponível (ver "Adaptações").
* A confirmar a execução: me passou os blocos de comandos, conferiu os registros brutos que eu gerei, o checksum e os limites efetivos, e apontou o que faltava (como o `NSpid` sem root).
* Com uma execução preliminar em uma VM de nuvem (KVM e Firecracker, cgroup v1), preservada em `results_vm_nuvem/` e usada só como conferência.
* Na redação inicial do relatório, dos slides, do README e do roteiro, a partir dos dados brutos.

## Adaptações dos scripts fornecidos

O kit de apoio citado no enunciado (`carga_cpu.py`, `evidencia_ns_mount.sh`, `run_experimentos.sh`, `resumo.py`) não estava disponível. Os scripts usados têm os mesmos nomes e a mesma função, com estas diferenças:

* `carga_cpu.py` lê o cgroup **de dentro do contêiner** e suporta v1 e v2, convertendo os nomes v1 para os equivalentes v2. Limite interno de 60 s.
* `run_experimentos.sh` usa ordem ABBA (C1 C2, C2 C1, C1 C2), nunca sobrescreve tentativas e aplica `timeout 90` no host.
* `evidencia_ns_mount.sh` também confere `NSpid` e os handles pelo `/proc` do host, e faz dois casos de controle na Parte D (root com `:ro`; não root em diretório gravável sem permissão).
* `resumo.py` recalcula o checksum fora do contêiner para provar que o trabalho foi o mesmo.
* Acrescentados `ambiente.sh`, `construir_imagem.sh`, `validar.py`, `graficos_extras.py` e `linha_do_tempo.py` (experimento extra que lê o `cpu.stat` pelo host a cada 20 ms).

## Sugestões aproveitadas, corrigidas ou rejeitadas

**Aproveitadas:** carga com trabalho fixo verificável por checksum; N congelado a partir do piloto; leitura do `cpu.max` efetivo em vez de confiar na flag `--cpus`; casos de controle na Parte D para separar montagem read-only de permissão.

**Corrigidas durante o trabalho (todas registradas nos dados):**

* Na execução preliminar, a primeira imagem tinha só `python3-minimal`, sem a biblioteca padrão completa; as duas execuções do piloto falharam com `ModuleNotFoundError: No module named 'json'` e estão preservadas em `results_vm_nuvem/raw/piloto/*_t1.*`.
* `ambiente.sh` imprimia uma linha "indisponivel" solta e não detectava o hipervisor, porque `grep -q`/`grep -m1` com `pipefail` fazia o `dmesg` falhar por SIGPIPE.
* No meu notebook, a primeira coleta da Parte B foi feita com o usuário comum, sem permissão para ler `/proc/<PID>/ns/*` de processos do root, e o script registrou erroneamente "daemon remoto". O registro foi preservado em `results/namespaces/tentativa1_sem_root/`, o script passou a informar o motivo real e refiz a coleta como root.
* O gerador do relatório leu o CSV sem tratar o fim de linha `\r\n` e mostrou "NaN" na razão C2/C1 numa versão intermediária; corrigido antes da entrega.
* Rótulos sobrepostos nos gráficos e caracteres de separação que eu pedi para não usar foram removidos de todos os arquivos.

**Rejeitadas:**

* Puxar a imagem por um espelho não oficial do Docker Hub para contornar o bloqueio de rede da VM de nuvem.
* Forçar cgroup v2 na VM de nuvem, cujos controladores já estavam em hierarquias v1 em uso.
* Ficar só com os dados da nuvem: preferi executar tudo no meu notebook.

## Erros e limitações conhecidos

* Três repetições por condição bastam para mediana e amplitude, não para inferência estatística.
* A carga tem uma thread; com várias threads, a comparação entre C1 e C2 mudaria.
* O WSL2 limita a VM a 4 CPUs lógicas.
