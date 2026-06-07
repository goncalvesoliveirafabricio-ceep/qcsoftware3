from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

app = FastAPI(title="API MapaMaquinas - Q.C Software (Estados Customizados)")

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO DE CONEXÃO E INFRAESTRUTURA NEON POSTGRESQL
# ---------------------------------------------------------------------------
SQLALCHEMY_DATABASE_URL = "postgresql://neondb_owner:npg_RibO1T8uQqNS@ep-flat-night-ap3lna17-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# ---------------------------------------------------------------------------
# MODELOS DE TABELAS (SQLALCHEMY ORM)
# ---------------------------------------------------------------------------
class MapaMaquinas(Base):
    # Alterado para o novo nome solicitado
    __tablename__ = "maquinas_mapa"
    
    id_maquinas = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    x = Column(Integer, default=0)
    y = Column(Integer, default=0)
    status = Column(String(30), default="Normal")
    ativo = Column(Boolean, default=True)

class HistoricoOcorrencias(Base):
    # Ajustado conforme a sua solicitação anterior
    __tablename__ = "maquinas_historico_ocorrencias"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    id_maquinas = Column(Integer, index=True)
    data_hora = Column(String(50))
    colaborador = Column(String(150))
    problema = Column(Text)

# ---------------------------------------------------------------------------
# GERENCIAMENTO E INICIALIZAÇÃO DO BANCO
# ---------------------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def inicializar_banco():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        total_maquinas = db.query(MapaMaquinas).count()
        if total_maquinas == 0:
            print("⚙️ Semeando 60 ativos industriais com status inicial 'Normal'...")
            maquinas_iniciais = [
                MapaMaquinas(id_maquinas=i, nome=f"MÁQ - {i:02d}", status="Normal", ativo=True)
                for i in range(1, 61)
            ]
            db.add_all(maquinas_iniciais)
            db.commit()
            print("✅ Tabela mapamaquinas configurada com sucesso!")
    except Exception as e:
        print(f"Erro ao inicializar dados: {e}")
        db.rollback()
    finally:
        db.close()

@app.on_event("startup")
def startup_event():
    inicializar_banco()

# ---------------------------------------------------------------------------
# SCHEMAS DE VALIDAÇÃO DE ENTRADA (PYDANTIC)
# ---------------------------------------------------------------------------
class OcorrenciaInput(BaseModel):
    data_hora: str
    colaborador: str
    problema: str

class ResolucaoInput(BaseModel):
    data_hora: str
    colaborador: str
    comentario: str

# ---------------------------------------------------------------------------
# ROTAS DA API MapaMaquinas
# ---------------------------------------------------------------------------

@app.get("/api/mapamaquinas")
def obter_maquinas(db: Session = Depends(get_db)):
    """Retorna os dados operacionais em tempo real de mapeamento do chão de fábrica"""
    maquinas = db.query(MapaMaquinas).filter(MapaMaquinas.ativo == True).order_by(MapaMaquinas.id_maquinas.asc()).all()
    return [
        {
            "id_maquinas": m.id_maquinas,
            "nome": m.nome,
            "x": m.x,
            "y": m.y,
            "status": m.status
        } for m in maquinas
    ]


@app.get("/api/mapamaquinas/{id_maquina}/ocorrencia")
def obter_ultima_ocorrencia(id_maquina: int, db: Session = Depends(get_db)):
    """Busca a última ocorrência para determinar o comportamento do modal"""
    ocorrencia = db.query(HistoricoOcorrencias).filter(
        HistoricoOcorrencias.id_maquinas == id_maquina
    ).order_by(HistoricoOcorrencias.id.desc()).first()
    
    # Se não houver registro ou se já contiver a flag de conclusão, a máquina está disponível para novos eventos
    if not ocorrencia or "[RESOLVIDO" in ocorrencia.problema:
        return {"tem_ocorrencia": False}
        
    return {
        "tem_ocorrencia": True,
        "data_hora": ocorrencia.data_hora,
        "colaborador": ocorrencia.colaborador,
        "problema": ocorrencia.problema
    }


@app.post("/api/mapamaquinas/{id_maquina}/ocorrencia")
def registrar_ocorrencia(id_maquina: int, dados: OcorrenciaInput, db: Session = Depends(get_db)):
    """Reporta um problema e altera o status da máquina no mapa para 'Parada' (Vermelho)"""
    maquina = db.query(MapaMaquinas).filter(MapaMaquinas.id_maquinas == id_maquina).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Ativo não localizado no Q.C Software")
    
    nova_ocorrencia = HistoricoOcorrencias(
        id_maquinas=id_maquina,
        data_hora=dados.data_hora,
        colaborador=dados.colaborador,
        problema=dados.problema
    )
    db.add(nova_ocorrencia)
    
    # Atualiza o status do monitoramento para Parada
    maquina.status = "Parada"
    
    db.commit()
    return {"status": "sucesso", "novo_status": maquina.status}


@app.post("/api/mapamaquinas/{id_maquina}/manutencao")
def colocar_em_manutencao(id_maquina: int, db: Session = Depends(get_db)):
    """Rota intermediária opcional: Altera o status do ativo para 'Manutenção' (Amarelo)"""
    maquina = db.query(MapaMaquinas).filter(MapaMaquinas.id_maquinas == id_maquina).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Ativo não localizado")
        
    maquina.status = "Manutenção"
    db.commit()
    return {"status": "sucesso", "novo_status": maquina.status}


@app.post("/api/mapamaquinas/{id_maquina}/resolver")
def resolver_ocorrencia(id_maquina: int, dados: ResolucaoInput, db: Session = Depends(get_db)):
    """Concatena os detalhes do encerramento técnico e reestabelece o ativo para 'Normal' (Verde)"""
    maquina = db.query(MapaMaquinas).filter(MapaMaquinas.id_maquinas == id_maquina).first()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina não localizada")

    ultima_ocorrencia = db.query(HistoricoOcorrencias).filter(
        HistoricoOcorrencias.id_maquinas == id_maquina
    ).order_by(HistoricoOcorrencias.id.desc()).first()
    
    if ultima_ocorrencia:
        texto_solucao = f"\n\n[RESOLVIDO em {dados.data_hora} por {dados.colaborador}]: {dados.comentario}"
        ultima_ocorrencia.problema = ultima_ocorrencia.problema + texto_solucao

    # Reseta o sinalizador visual da máquina de volta ao status estável
    maquina.status = "Normal"
    
    db.commit()
    return {"status": "sucesso", "novo_status": maquina.status}

# ---------------------------------------------------------------------------
# INTERFACE ESTÁTICA
# ---------------------------------------------------------------------------
app.mount("/", StaticFiles(directory=".", html=True), name="raiz")