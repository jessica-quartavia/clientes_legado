import {
  FINANCIAL_DISPLAY_ORDER,
  FINANCIAL_FIELD_LABELS,
  formatFinancialValue,
  computePatrimonioResumo,
} from '../lib/financial.js';

export default function ClientDrawer({ client, onClose }) {
  if (!client) return null;

  const fin = client.financial ?? null;
  const patrimonioResumo =
    client.finance_patrimonio ?? (fin ? computePatrimonioResumo(fin) : null);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden />
      <aside className="drawer" role="dialog" aria-label="Detalhe do cliente">
        <header className="drawer__header">
          <div>
            <h2>{client.nome}</h2>
            <p className="muted">{client.qv_id ?? client.baseqv_client_id}</p>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Fechar
          </button>
        </header>

        <div className="drawer__body">
          <Section title="Identificação">
            <Row label="Nome" value={client.nome} />
            <Row label="CPF" value={client.cpf} />
            <Row label="Telefone" value={client.telefone} />
            <Row label="Email" value={client.email} />
            <Row label="QV ID" value={client.qv_id} />
            <Row label="Programa" value={client.programa} />
            <Row label="Status" value={client.status} />
            <Row label="EP" value={client.engenheiro_patrimonial} />
          </Section>

          <Section title="Mecanismos">
            {client.mecanismos_lista?.length ? (
              <ul className="drawer-list">
                {client.mecanismos_lista.map((m) => (
                  <li key={m.id}>
                    {m.nome ?? m.mecanismo_id} — {m.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nenhum mecanismo</p>
            )}
          </Section>

          <Section title="Reunião">
            <Row label="Última reunião" value={client.ultima_reuniao_nome} />
            <Row label="Data" value={formatDate(client.ultima_reuniao_data)} />
            <Row label="Responsável" value={client.ultima_reuniao_responsavel} />
          </Section>

          <Section title="Dados financeiros">
            {!fin ? (
              <p className="muted">Sem dados financeiros</p>
            ) : (
              <>
                <Row
                  label="Patrimônio (resumo)"
                  value={formatFinancialValue(patrimonioResumo, 'valor_imoveis_quitados')}
                />
                {FINANCIAL_DISPLAY_ORDER.map((key) => {
                  if (!(key in fin)) return null;
                  return (
                    <Row
                      key={key}
                      label={FINANCIAL_FIELD_LABELS[key] ?? key}
                      value={formatFinancialValue(fin[key], key)}
                    />
                  );
                })}
              </>
            )}
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({ title, children }) {
  return (
    <section className="drawer-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  const display = value == null || value === '' || value === 'null' || value === 'undefined' ? '—' : value;
  return (
    <div className="drawer-row">
      <span className="drawer-row__label">{label}</span>
      <span className="drawer-row__value">{display}</span>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

