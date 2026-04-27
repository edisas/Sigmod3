from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.rate_limit import rate_limit
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.core.senasica import audit_senasica, is_senasica
from app.db import get_db
from app.dependencies import get_current_state_id, get_current_user
from app.models import State, User, UserState
from app.schemas import (
    LoginRequest,
    MeResponse,
    RegisterRequest,
    SelectStateRequest,
    StateResponse,
    SwitchStateRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter()

REGISTER_ROLES_WITH_FIGURA = {
    "capturista",
    "profesional fitosanitario autorizado",
}


def to_user_response(user: User) -> UserResponse:
    names = [n for n in user.nombre.split() if n]
    initials = "".join(part[0].upper() for part in names[:2]) or "U"
    return UserResponse(
        id=str(user.id),
        full_name=user.nombre,
        email=user.email,
        role=user.rol,
        initials=initials,
        facility=user.facility,
        phone=None,
        bio=None,
        sector=None,
    )


def to_state_response(state: State) -> StateResponse:
    return StateResponse(id=state.id, clave=state.clave, nombre=state.nombre)


def load_available_states(db: Session) -> list[StateResponse]:
    rows = []
    try:
        rows = db.execute(
            text(
                """
                SELECT id, clave, nombre
                FROM estados
                WHERE estatus_id = 1
                  AND mostrar_en_registro = 1
                ORDER BY nombre ASC
                """
            )
        ).fetchall()
    except SQLAlchemyError:
        try:
            rows = db.execute(
                text(
                    """
                    SELECT id, clave, nombre
                    FROM estados
                    WHERE activo = 1
                      AND mostrar_en_registro = 1
                    ORDER BY nombre ASC
                    """
                )
            ).fetchall()
        except SQLAlchemyError:
            try:
                rows = db.execute(
                    text(
                        """
                        SELECT id, clave, nombre
                        FROM estados
                        WHERE mostrar_en_registro = 1
                        ORDER BY nombre ASC
                        """
                    )
                ).fetchall()
            except SQLAlchemyError:
                rows = db.execute(
                    text(
                        """
                        SELECT id, clave, nombre
                        FROM estados
                        ORDER BY nombre ASC
                        """
                    )
                ).fetchall()
    return [StateResponse(id=int(r.id), clave=str(r.clave), nombre=str(r.nombre)) for r in rows]


def load_user_states(db: Session, user_id: int) -> list[State]:
    return (
        db.query(State)
        .join(UserState, UserState.estado_id == State.id)
        .filter(
            UserState.usuario_id == user_id,
            UserState.estatus_id == 1,
            State.estatus_id == 1,
            State.participa_sigmod == 1,
        )
        .order_by(State.nombre.asc())
        .all()
    )


def load_figuras_vigentes_para_registro(db: Session) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT DISTINCT f.id, f.nombre, f.nombre_corto
            FROM figura_cooperadora f
            INNER JOIN figura_cooperadora_detalle_autorizaciones a ON a.figura_cooperadora_id = f.id
            INNER JOIN temporadas t ON t.id = a.temporada_id
            WHERE f.estatus_id = 1
              AND a.estatus_id = 1
              AND t.estatus_id = 1
            ORDER BY f.nombre ASC
            """
        )
    ).mappings().all()
    return [
        {
            "id": int(f["id"]),
            "nombre": str(f["nombre"]),
            "nombre_corto": str(f["nombre_corto"]) if f["nombre_corto"] is not None else None,
        }
        for f in rows
    ]


def build_login_response(user: User, states: list[State]) -> TokenResponse:
    user_payload = to_user_response(user)

    # Senasica entra sin selección de estado: se autoasigna el primer estado activo
    # y participante del catálogo, sin importar las asignaciones de usuarios_detalle.
    # El selector dinámico del dashboard le permite cambiar.
    if is_senasica(user):
        from sqlalchemy.orm import object_session  # local import

        db = object_session(user)
        national_states = (
            db.query(State)
            .filter(State.estatus_id == 1, State.participa_sigmod == 1)
            .order_by(State.nombre.asc())
            .all()
        ) if db is not None else []
        if not national_states:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No hay estados activos y participantes")
        active_state = to_state_response(national_states[0])
        token = create_access_token(subject=str(user.id), estado_activo_id=active_state.id, scope="access")
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            requires_state_selection=False,
            available_states=[to_state_response(s) for s in national_states],
            active_state=active_state,
            user=user_payload,
        )

    if not states:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario sin estados asignados")

    states_payload = [to_state_response(state) for state in states]

    if len(states_payload) == 1:
        active_state = states_payload[0]
        token = create_access_token(subject=str(user.id), estado_activo_id=active_state.id, scope="access")
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            requires_state_selection=False,
            available_states=states_payload,
            active_state=active_state,
            user=user_payload,
        )

    selection_token = create_access_token(subject=str(user.id), scope="state_select", expires_minutes=10)
    return TokenResponse(
        access_token=None,
        token_type=None,
        requires_state_selection=True,
        state_selection_token=selection_token,
        available_states=states_payload,
        active_state=None,
        user=user_payload,
    )


@router.get("/estados-disponibles", response_model=list[StateResponse])
def available_states(db: Session = Depends(get_db)) -> list[StateResponse]:
    return load_available_states(db)


@router.get("/register-catalogos")
def register_catalogos(db: Session = Depends(get_db)) -> dict:
    roles = db.execute(
        text(
            """
            SELECT id, nombre, descripcion
            FROM roles
            WHERE estatus_id = 1
              AND mostrar_en_registro = 1
            ORDER BY nombre ASC
            """
        )
    ).mappings().all()

    figuras = load_figuras_vigentes_para_registro(db)
    figuras_vigentes_count = len(figuras)

    return {
        "roles": [
            {
                "id": int(r["id"]),
                "nombre": str(r["nombre"]),
                "descripcion": str(r["descripcion"]) if r["descripcion"] is not None else None,
            }
            for r in roles
        ],
        "figuras_cooperadoras": figuras,
        "figuras_vigentes_count": figuras_vigentes_count,
    }


def generate_unique_username(db: Session, email: str) -> str:
    base = email.split("@")[0].lower().strip().replace(" ", "")
    candidate = base[:50] if base else "usuario"
    suffix = 1

    while db.query(User).filter(User.nombre_usuario == candidate).first() is not None:
        suffix_text = str(suffix)
        trimmed = base[: 50 - len(suffix_text)] if base else "usuario"
        candidate = f"{trimmed}{suffix_text}"
        suffix += 1
    return candidate


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("v3-register", max_attempts=5, window_seconds=3600))],
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    exists = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El correo ya está registrado")

    requested_states = sorted(set(payload.estados_ids))
    if not requested_states:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecciona al menos un estado")

    active_states = load_available_states(db)
    active_ids = {s.id for s in active_states}
    if any(state_id not in active_ids for state_id in requested_states):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uno o más estados no son válidos")

    role_row = db.execute(
        text(
            """
            SELECT id, nombre
            FROM roles
            WHERE id = :rol_id
              AND estatus_id = 1
              AND mostrar_en_registro = 1
            LIMIT 1
            """
        ),
        {"rol_id": payload.rol_id},
    ).mappings().first()
    if not role_row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El rol seleccionado no es válido")

    role_name = str(role_row["nombre"]).strip()
    role_name_lower = role_name.lower()

    figura_id: int | None = None
    if role_name_lower in REGISTER_ROLES_WITH_FIGURA:
        figuras_vigentes = load_figuras_vigentes_para_registro(db)
        if not figuras_vigentes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No hay figuras cooperadoras con autorización vigente para registrar este rol.",
            )
        if payload.figura_cooperadora_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debes seleccionar una figura cooperadora para el rol seleccionado",
            )
        figura_row = db.execute(
            text(
                """
                SELECT DISTINCT f.id
                FROM figura_cooperadora f
                INNER JOIN figura_cooperadora_detalle_autorizaciones a ON a.figura_cooperadora_id = f.id
                INNER JOIN temporadas t ON t.id = a.temporada_id
                WHERE f.id = :id
                  AND f.estatus_id = 1
                  AND a.estatus_id = 1
                  AND t.estatus_id = 1
                LIMIT 1
                """
            ),
            {"id": payload.figura_cooperadora_id},
        ).first()
        if not figura_row:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La figura cooperadora no es válida")
        figura_id = int(payload.figura_cooperadora_id)
    else:
        figura_id = None

    first_state_id = requested_states[0]
    user = User(
        nombre_usuario=generate_unique_username(db, payload.email),
        nombre=payload.full_name.strip(),
        email=payload.email.lower().strip(),
        facility=payload.facility.strip() if payload.facility else None,
        password_hash=hash_password(payload.password),
        rol=role_name,
        estatus_id=1,
        estado_id=first_state_id,
        figura_cooperadora_id=figura_id,
    )
    db.add(user)
    db.flush()

    for state_id in requested_states:
        db.add(UserState(usuario_id=user.id, estado_id=state_id, estatus_id=1))

    db.commit()
    db.refresh(user)

    user_states = load_user_states(db, user.id)
    return build_login_response(user, user_states)


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit("v3-login", max_attempts=10, window_seconds=900))],
)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = (
        db.query(User)
        .filter(User.nombre_usuario == payload.nombre_usuario.strip(), User.estatus_id == 1)
        .first()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    user_states = load_user_states(db, user.id)
    return build_login_response(user, user_states)


@router.post("/select-state", response_model=TokenResponse)
def select_state(payload: SelectStateRequest, db: Session = Depends(get_db)) -> TokenResponse:
    claims = decode_token(payload.state_selection_token)
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de selección inválido")

    if claims.get("scope") != "state_select":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de selección inválido")

    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token de selección inválido")

    user = db.query(User).filter(User.id == int(user_id), User.estatus_id == 1).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    state = (
        db.query(State)
        .join(UserState, UserState.estado_id == State.id)
        .filter(
            UserState.usuario_id == user.id,
            UserState.estado_id == payload.estado_id,
            UserState.estatus_id == 1,
            State.estatus_id == 1,
            State.participa_sigmod == 1,
        )
        .first()
    )
    if not state:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso al estado seleccionado, está inactivo o no participa en SIGMOD")

    access_token = create_access_token(subject=str(user.id), estado_activo_id=state.id, scope="access")
    user_states = load_user_states(db, user.id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        requires_state_selection=False,
        available_states=[to_state_response(item) for item in user_states],
        active_state=to_state_response(state),
        user=to_user_response(user),
    )


@router.post("/switch-state", response_model=TokenResponse)
def switch_state(
    payload: SwitchStateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_state_id: int = Depends(get_current_state_id),
) -> TokenResponse:
    """Permite a un Senasica cambiar dinámicamente el estado activo del JWT.

    Solo accesible para rol Administrador Senasica. Otros roles deben re-loguearse
    para cambiar de estado.
    """
    if not is_senasica(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo Administrador Senasica puede cambiar de estado dinámicamente")

    state = (
        db.query(State)
        .filter(State.id == payload.estado_id, State.estatus_id == 1, State.participa_sigmod == 1)
        .first()
    )
    if not state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estado no existe, está inactivo o no participa en SIGMOD")

    new_token = create_access_token(subject=str(current_user.id), estado_activo_id=state.id, scope="access")

    audit_senasica(
        db,
        user=current_user,
        accion="switch-state",
        metodo="POST",
        path="/auth/switch-state",
        estado_afectado_id=state.id,
        recurso_tipo="estado_activo",
        recurso_id=str(state.id),
        datos_request={"estado_id_anterior": current_state_id, "estado_id_nuevo": state.id, "estado_nombre": state.nombre},
        resultado_status=200,
        ip_origen=request.client.host if request.client else None,
        observaciones=f"Cambio de estado activo: {current_state_id} -> {state.id}",
    )
    db.commit()

    available = (
        db.query(State)
        .filter(State.estatus_id == 1, State.participa_sigmod == 1)
        .order_by(State.nombre.asc())
        .all()
    )
    return TokenResponse(
        access_token=new_token,
        token_type="bearer",
        requires_state_selection=False,
        available_states=[to_state_response(s) for s in available],
        active_state=to_state_response(state),
        user=to_user_response(current_user),
    )


def _states_for_user(db: Session, user: User) -> list[State]:
    """Senasica ve todos los estados activos+participantes; resto, solo los asignados."""
    if is_senasica(user):
        return (
            db.query(State)
            .filter(State.estatus_id == 1, State.participa_sigmod == 1)
            .order_by(State.nombre.asc())
            .all()
        )
    return load_user_states(db, user.id)


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user), current_state_id: int = Depends(get_current_state_id), db: Session = Depends(get_db)) -> MeResponse:
    user_states = _states_for_user(db, current_user)
    active_state = next((state for state in user_states if state.id == current_state_id), None)

    return MeResponse(
        user=to_user_response(current_user),
        active_state=to_state_response(active_state) if active_state else None,
        available_states=[to_state_response(state) for state in user_states],
    )
