-- ==============================================================================
-- Chain_hlv.sql â€” EduOS Supabase Schema (v3.0 â€” PRODUÃ‡ÃƒO READY)
-- MELHORIAS DESTA VERSÃƒO:
--   1. Constraint UNIQUE(aluno_id, turma_id) em matriculas â†’ evita duplicatas
--   2. Guard de capacidade no trigger (impede INSERT quando turma cheia)
--   3. View v_certificados_status para calcular status automaticamente
--   4. Ãndices adicionais em certificados(status) e pagamentos(data_vencimento)
--   5. Policy pÃºblica de certificados REMOVIDA (substituir por Edge Function)
--   6. ComentÃ¡rio de instruÃ§Ã£o do Auth Hook atualizado
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSÃ•ES E FUNÃ‡Ã•ES DE SEGURANÃ‡A
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- LÃª tenant_id do JWT (injetado pelo Auth Hook do Supabase)
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Retorna o role do usuÃ¡rio logado sem recursÃ£o de RLS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
DECLARE _role text;
BEGIN
  SELECT role INTO _role
  FROM public.perfis
  WHERE user_id = auth.uid()
    AND tenant_id = public.get_tenant_id()
  LIMIT 1;
  RETURN _role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==============================================================================
-- 2. TRIGGER: ATUALIZAR VAGAS OCUPADAS (com guard de capacidade)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.atualizar_ocupadas()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.turma_id IS NOT NULL THEN
    -- NOVO: bloqueia insert se turma jÃ¡ estiver cheia
    PERFORM 1 FROM public.turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
    IF FOUND THEN
      RAISE EXCEPTION 'Turma sem vagas disponÃ­veis (capacidade mÃ¡xima atingida).';
    END IF;
    UPDATE public.turmas SET ocupadas = ocupadas + 1 WHERE id = NEW.turma_id;

  ELSIF TG_OP = 'DELETE' AND OLD.turma_id IS NOT NULL THEN
    UPDATE public.turmas SET ocupadas = GREATEST(ocupadas - 1, 0) WHERE id = OLD.turma_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.turma_id IS DISTINCT FROM NEW.turma_id THEN
      IF OLD.turma_id IS NOT NULL THEN
        UPDATE public.turmas SET ocupadas = GREATEST(ocupadas - 1, 0) WHERE id = OLD.turma_id;
      END IF;
      IF NEW.turma_id IS NOT NULL THEN
        -- Guard tambÃ©m no UPDATE de turma
        PERFORM 1 FROM public.turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
        IF FOUND THEN
          RAISE EXCEPTION 'Turma sem vagas disponÃ­veis.';
        END IF;
        UPDATE public.turmas SET ocupadas = ocupadas + 1 WHERE id = NEW.turma_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 3. TABELAS
-- ==============================================================================

CREATE TABLE public.tenants (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome         VARCHAR(255) NOT NULL,
    cnpj         VARCHAR(20),
    logo_url     TEXT,
    cor_primaria VARCHAR(20)  DEFAULT '#cc785c',
    created_at   TIMESTAMPTZ  DEFAULT timezone('utc', now())
);

CREATE TABLE public.perfis (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id  UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
    nome       VARCHAR(255) NOT NULL,
    role       VARCHAR(50)  NOT NULL CHECK (role IN (
                   'super_admin','admin','coordenador',
                   'secretaria','financeiro','comercial','instrutor','aluno'
               )),
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(user_id, tenant_id)
);

CREATE TABLE public.empresas (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    nome        VARCHAR(255) NOT NULL,
    cnpj        VARCHAR(20)  UNIQUE,
    responsavel VARCHAR(255),
    email       VARCHAR(255),
    telefone    VARCHAR(20),
    status      VARCHAR(20)  DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE TABLE public.cursos (
    id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID         REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    nome           VARCHAR(255) NOT NULL,
    codigo         VARCHAR(50)  NOT NULL,   -- ex: 'NR-35', usado na geraÃ§Ã£o do cÃ³digo de turma
    carga_horaria  INTEGER      NOT NULL,
    validade_meses INTEGER,                 -- NULL = sem validade
    valor_padrao   DECIMAL(10,2) NOT NULL,
    ativo          BOOLEAN      DEFAULT true,
    created_at     TIMESTAMPTZ  DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, codigo)
);

CREATE TABLE public.instrutores (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    nome           VARCHAR(255) NOT NULL,
    email          VARCHAR(255),
    telefone       VARCHAR(20),
    especialidades TEXT[]       DEFAULT '{}',
    avaliacao      DECIMAL(2,1) DEFAULT 5.0 CHECK (avaliacao BETWEEN 1 AND 5),
    ativo          BOOLEAN     DEFAULT true,
    created_at     TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE TABLE public.alunos (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    nome            VARCHAR(255) NOT NULL,
    cpf             VARCHAR(14)  NOT NULL,
    email           VARCHAR(255),
    telefone        VARCHAR(20),
    data_nascimento DATE,
    tipo_pessoa     VARCHAR(20)  DEFAULT 'pessoa_fisica' CHECK (tipo_pessoa IN ('pessoa_fisica','empresa')),
    empresa_id      UUID        REFERENCES public.empresas(id) ON DELETE SET NULL,
    status          VARCHAR(20)  DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
    observacoes     TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, cpf)
);

CREATE TABLE public.turmas (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    curso_id       UUID        REFERENCES public.cursos(id) NOT NULL,
    instrutor_id   UUID        REFERENCES public.instrutores(id) ON DELETE SET NULL,
    -- Formato automÃ¡tico: SIGLA-ANO-SEQ (ex: NR35-2025-003)
    codigo         VARCHAR(50)  NOT NULL,
    data_inicio    DATE         NOT NULL,
    data_fim       DATE,
    horario_inicio TIME,
    horario_fim    TIME,
    local          VARCHAR(255),
    link_video     TEXT,
    vagas          INTEGER      NOT NULL CHECK (vagas > 0),
    ocupadas       INTEGER      DEFAULT 0 CHECK (ocupadas >= 0),
    status         VARCHAR(20)  DEFAULT 'agendada' CHECK (status IN (
                       'agendada','em_andamento','concluida','cancelada'
                   )),
    created_at     TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, codigo)
);

CREATE TABLE public.matriculas (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    aluno_id    UUID        REFERENCES public.alunos(id) NOT NULL,
    turma_id    UUID        REFERENCES public.turmas(id) ON DELETE SET NULL,
    curso_id    UUID        REFERENCES public.cursos(id) NOT NULL,
    status      VARCHAR(30)  DEFAULT 'matriculado' CHECK (status IN (
                    'matriculado','aguardando_turma','em_andamento',
                    'concluido','certificado_emitido','cancelado'
                )),
    observacoes TEXT,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now()),
    -- NOVO: impede duplicata aluno x turma
    CONSTRAINT uq_matricula_aluno_turma UNIQUE (aluno_id, turma_id)
);

CREATE TABLE public.pagamentos (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    matricula_id    UUID        REFERENCES public.matriculas(id) ON DELETE CASCADE NOT NULL,
    aluno_id        UUID        REFERENCES public.alunos(id) ON DELETE CASCADE NOT NULL,
    curso_id        UUID        REFERENCES public.cursos(id) ON DELETE SET NULL,
    valor           DECIMAL(10,2) NOT NULL,
    data_vencimento DATE         NOT NULL,
    data_pagamento  DATE,
    status          VARCHAR(20)  DEFAULT 'pendente' CHECK (status IN (
                        'pendente','recebido','atraso','cancelado','isento'
                    )),
    tipo_pagamento  VARCHAR(30) CHECK (tipo_pagamento IN (
                        'pix','boleto','cartao_credito','cartao_debito',
                        'transferencia','dinheiro'
                    )),
    recibo          VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE TABLE public.certificados (
    id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id          UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    aluno_id           UUID        REFERENCES public.alunos(id) NOT NULL,
    curso_id           UUID        REFERENCES public.cursos(id) NOT NULL,
    turma_id           UUID        REFERENCES public.turmas(id) ON DELETE SET NULL,
    matricula_id       UUID        REFERENCES public.matriculas(id) ON DELETE SET NULL,
    codigo_verificacao VARCHAR(50)  UNIQUE NOT NULL,
    data_emissao       DATE         NOT NULL,
    data_validade      DATE,        -- NULL = sem validade
    status             VARCHAR(20)  DEFAULT 'valido' CHECK (status IN (
                           'valido','a_vencer','vencido','revogado'
                       )),
    created_at         TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ==============================================================================
-- 4. VIEW: STATUS CALCULADO DE CERTIFICADOS (sem depender de cron externo)
-- ==============================================================================
-- Use esta view em queries que precisam do status atualizado em tempo real.
-- Em produÃ§Ã£o, combine com uma Edge Function que sincroniza certificados.status
-- periodicamente para manter consistÃªncia no campo fÃ­sico.
CREATE OR REPLACE VIEW public.v_certificados_status AS
SELECT
  *,
  CASE
    WHEN status = 'revogado' THEN 'revogado'
    WHEN data_validade IS NULL THEN 'valido'
    WHEN data_validade < CURRENT_DATE THEN 'vencido'
    WHEN data_validade <= CURRENT_DATE + INTERVAL '30 days' THEN 'a_vencer'
    ELSE 'valido'
  END AS status_calculado
FROM public.certificados;

-- ==============================================================================
-- 5. TRIGGERS
-- ==============================================================================
CREATE TRIGGER trigger_atualizar_ocupadas
  AFTER INSERT OR UPDATE OR DELETE ON public.matriculas
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_ocupadas();

-- ==============================================================================
-- 6. ÃNDICES
-- ==============================================================================
CREATE INDEX idx_alunos_tenant          ON public.alunos(tenant_id);
CREATE INDEX idx_alunos_empresa         ON public.alunos(empresa_id);
CREATE INDEX idx_turmas_tenant          ON public.turmas(tenant_id);
CREATE INDEX idx_turmas_curso           ON public.turmas(curso_id);
CREATE INDEX idx_turmas_instrutor       ON public.turmas(instrutor_id);
CREATE INDEX idx_matriculas_tenant      ON public.matriculas(tenant_id);
CREATE INDEX idx_matriculas_aluno       ON public.matriculas(aluno_id);
CREATE INDEX idx_matriculas_turma       ON public.matriculas(turma_id);
CREATE INDEX idx_pagamentos_tenant      ON public.pagamentos(tenant_id);
CREATE INDEX idx_pagamentos_aluno       ON public.pagamentos(aluno_id);
CREATE INDEX idx_pagamentos_matricula   ON public.pagamentos(matricula_id);
-- NOVOS Ã­ndices para queries frequentes
CREATE INDEX idx_pagamentos_vencimento  ON public.pagamentos(tenant_id, data_vencimento);
CREATE INDEX idx_certificados_tenant    ON public.certificados(tenant_id);
CREATE INDEX idx_certificados_aluno     ON public.certificados(aluno_id);
CREATE INDEX idx_certificados_codigo    ON public.certificados(codigo_verificacao);
CREATE INDEX idx_certificados_status    ON public.certificados(tenant_id, status);
CREATE INDEX idx_certificados_validade  ON public.certificados(tenant_id, data_validade);

-- ==============================================================================
-- 7. ROW LEVEL SECURITY
-- ==============================================================================
ALTER TABLE public.tenants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrutores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 8. POLÃTICAS RLS
-- ==============================================================================

-- Super Admin
CREATE POLICY "Super_Admin_Bypass"        ON public.tenants      FOR ALL USING (public.get_user_role() = 'super_admin');
CREATE POLICY "Super_Admin_Bypass_Perfis" ON public.perfis       FOR ALL USING (public.get_user_role() = 'super_admin');

-- Tenants & Perfis
CREATE POLICY "Tenants_Leitura"           ON public.tenants      FOR SELECT USING (id = public.get_tenant_id());
CREATE POLICY "Perfis_Admin_All"          ON public.perfis       FOR ALL    USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'admin');
CREATE POLICY "Perfis_Proprio_Leitura"   ON public.perfis       FOR SELECT USING (user_id = auth.uid());

-- Empresas
CREATE POLICY "Empresas_Admin_Comercial_All" ON public.empresas FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','comercial'));
CREATE POLICY "Empresas_Outros_Select"       ON public.empresas FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('secretaria','financeiro','coordenador'));

-- Cursos
CREATE POLICY "Cursos_Admin_Coord_All"  ON public.cursos FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador'));
CREATE POLICY "Cursos_Todos_Select"     ON public.cursos FOR SELECT
  USING (tenant_id = public.get_tenant_id());

-- Instrutores
CREATE POLICY "Instrutores_Admin_All"   ON public.instrutores FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador'));
CREATE POLICY "Instrutores_Select"      ON public.instrutores FOR SELECT
  USING (tenant_id = public.get_tenant_id());

-- Alunos
CREATE POLICY "Alunos_Geral_All"        ON public.alunos FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','secretaria','comercial'));
CREATE POLICY "Alunos_Coord_Select"     ON public.alunos FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'coordenador');
CREATE POLICY "Alunos_Proprio_Select"   ON public.alunos FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND user_id = auth.uid());

-- Turmas
CREATE POLICY "Turmas_Admin_Coord_All"       ON public.turmas FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador'));
CREATE POLICY "Turmas_Geral_Select"          ON public.turmas FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('secretaria','comercial','aluno','financeiro'));
CREATE POLICY "Turmas_Instrutor_Propria_All" ON public.turmas FOR ALL
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'instrutor'
    AND instrutor_id = (SELECT id FROM public.instrutores WHERE user_id = auth.uid() LIMIT 1)
  );

-- MatrÃ­culas
CREATE POLICY "Matriculas_Geral_All"     ON public.matriculas FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','secretaria','comercial'));
CREATE POLICY "Matriculas_Coord_Select"  ON public.matriculas FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'coordenador');
CREATE POLICY "Matriculas_Aluno_Select"  ON public.matriculas FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- Pagamentos
CREATE POLICY "Pagamentos_Fin_Admin_All"  ON public.pagamentos FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','financeiro'));
CREATE POLICY "Pagamentos_Aluno_Select"   ON public.pagamentos FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- Certificados (policy pÃºblica REMOVIDA â€” usar Edge Function)
CREATE POLICY "Certificados_Geral_All"    ON public.certificados FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador','secretaria'));
CREATE POLICY "Certificados_Aluno_Select" ON public.certificados FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- ==============================================================================

-- ==============================================================================
-- MIGRAÇÕES E CORREÇÕES (M1, M3, Fixes)
-- ==============================================================================

-- SQL/M1_Alunos_CEP.sql
-- Adiciona colunas de endereÃ§o Ã  tabela de alunos

ALTER TABLE public.alunos 
ADD COLUMN IF NOT EXISTS cep VARCHAR(10),
ADD COLUMN IF NOT EXISTS rua VARCHAR(255),
ADD COLUMN IF NOT EXISTS numero VARCHAR(20),
ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
ADD COLUMN IF NOT EXISTS bairro VARCHAR(100),
ADD COLUMN IF NOT EXISTS cidade VARCHAR(100),
ADD COLUMN IF NOT EXISTS uf VARCHAR(2);


-- SQL/M3_Matriculas_RPC.sql
-- Previne a duplicidade de matrÃ­culas ativas e de certificados, e classifica renovaÃ§Ãµes.

CREATE OR REPLACE FUNCTION public.autorizar_matricula(p_aluno_id UUID, p_curso_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_matricula_ativa BOOLEAN;
    v_cert_valido BOOLEAN;
    v_cert_vencido BOOLEAN;
    v_tipo VARCHAR := 'Nova MatrÃ­cula';
BEGIN
    -- 1. Verifica matrÃ­cula ativa
    SELECT EXISTS (
        SELECT 1 FROM public.matriculas 
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id 
        AND status IN ('matriculado', 'aguardando_turma', 'em_andamento')
    ) INTO v_matricula_ativa;

    IF v_matricula_ativa THEN
        RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno jÃ¡ possui matrÃ­cula ativa neste curso.');
    END IF;

    -- 2. Verifica se jÃ¡ possui certificado vÃ¡lido
    SELECT EXISTS (
        SELECT 1 FROM public.certificados 
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id AND status = 'valido'
    ) INTO v_cert_valido;

    IF v_cert_valido THEN
        RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno jÃ¡ possui um certificado vÃ¡lido para este curso.');
    END IF;

    -- 3. Verifica renovaÃ§Ã£o/reciclagem
    SELECT EXISTS (
        SELECT 1 FROM public.certificados 
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id AND status = 'vencido'
    ) INTO v_cert_vencido;

    IF v_cert_vencido THEN
        v_tipo := 'RenovaÃ§Ã£o/Reciclagem';
    END IF;

    RETURN jsonb_build_object('autorizado', true, 'tipo_matricula', v_tipo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- EduOS â€” Triggers SQL de apoio aos 4 fixes crÃ­ticos
-- Aplique no Supabase SQL Editor (Dashboard â†’ SQL Editor)
-- ============================================================

-- â”€â”€â”€ FIX 1: Manter turmas.ocupadas sincronizado automaticamente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Trigger que incrementa/decrementa turmas.ocupadas ao inserir/atualizar matriculas.
-- Funciona como fallback ao ajuste feito no JS (matriculas.js â†’ adjustOcupadas).

CREATE OR REPLACE FUNCTION fn_sync_turma_ocupadas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- INSERT com turma_id: incrementa
  IF TG_OP = 'INSERT' AND NEW.turma_id IS NOT NULL THEN
    UPDATE turmas
    SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1)
    WHERE id = NEW.turma_id;

  -- UPDATE: troca de turma ou mudanÃ§a de status (cancelado)
  ELSIF TG_OP = 'UPDATE' THEN

    -- Cancelou a matrÃ­cula que tinha turma â†’ decrementa
    IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' AND OLD.turma_id IS NOT NULL THEN
      UPDATE turmas
      SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1)
      WHERE id = OLD.turma_id;

    -- Reativou matrÃ­cula cancelada â†’ incrementa
    ELSIF OLD.status = 'cancelado' AND NEW.status <> 'cancelado' AND NEW.turma_id IS NOT NULL THEN
      UPDATE turmas
      SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1)
      WHERE id = NEW.turma_id;

    -- Mudou de turma â†’ decrementa antiga, incrementa nova
    ELSIF OLD.turma_id IS DISTINCT FROM NEW.turma_id THEN
      IF OLD.turma_id IS NOT NULL THEN
        UPDATE turmas SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1) WHERE id = OLD.turma_id;
      END IF;
      IF NEW.turma_id IS NOT NULL THEN
        UPDATE turmas SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1) WHERE id = NEW.turma_id;
      END IF;
    END IF;

  -- DELETE com turma_id: decrementa
  ELSIF TG_OP = 'DELETE' AND OLD.turma_id IS NOT NULL AND OLD.status <> 'cancelado' THEN
    UPDATE turmas
    SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1)
    WHERE id = OLD.turma_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Remove trigger antigo se existir e recria
DROP TRIGGER IF EXISTS trg_matriculas_ocupadas ON matriculas;

CREATE TRIGGER trg_matriculas_ocupadas
AFTER INSERT OR UPDATE OF status, turma_id OR DELETE
ON matriculas
FOR EACH ROW
EXECUTE FUNCTION fn_sync_turma_ocupadas();


-- â”€â”€â”€ FIX 2: Status de certificados calculado por coluna gerada â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- OPCIONAL: Adiciona coluna gerada que sempre reflete o status correto.
-- Se preferir manter como coluna normal (gerenciada pelo JS), pule este bloco.

-- ALTER TABLE certificados
--   DROP COLUMN IF EXISTS status_calculado;
-- 
-- ALTER TABLE certificados
--   ADD COLUMN status_calculado TEXT GENERATED ALWAYS AS (
--     CASE
--       WHEN data_validade IS NULL THEN 'valido'
--       WHEN data_validade < CURRENT_DATE THEN 'vencido'
--       WHEN data_validade <= CURRENT_DATE + INTERVAL '30 days' THEN 'a_vencer'
--       ELSE 'valido'
--     END
--   ) STORED;


-- â”€â”€â”€ FIX 3: Marcar pagamentos em atraso automaticamente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Stored procedure que pode ser chamada via cron (pg_cron) ou manualmente.
-- O JS (financeiro.js â†’ autoMarkAtrasados) jÃ¡ resolve isso no frontend,
-- mas esta funÃ§Ã£o garante consistÃªncia mesmo sem abrir o app.

CREATE OR REPLACE FUNCTION fn_mark_pagamentos_atrasados()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  linhas_afetadas INTEGER;
BEGIN
  UPDATE pagamentos
  SET status = 'atraso'
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;

  GET DIAGNOSTICS linhas_afetadas = ROW_COUNT;
  RETURN linhas_afetadas;
END;
$$;

-- Para agendar via pg_cron (executar 1x por dia Ã  meia-noite):
-- SELECT cron.schedule('mark-atrasados', '0 0 * * *', 'SELECT fn_mark_pagamentos_atrasados()');

-- ExecuÃ§Ã£o manual (teste):
-- SELECT fn_mark_pagamentos_atrasados();
