use std::{error::Error, net::SocketAddr, sync::Arc, thread, time::Duration};

use axum::{routing::get, Router};
use sqlx::PgPool;
use tokio::sync::broadcast;
use tower_governor::{
    governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor, GovernorLayer,
};

use crate::LiveState;

mod cors;
mod health;
pub mod live;

pub struct AppState {
    tx: broadcast::Sender<live::LiveEvent>,
    state: LiveState,
    db: PgPool,
}

fn addr() -> String {
    std::env::var("BACKEND_ADDRESS").unwrap_or("0.0.0.0:4000".to_string())
}

const CLEANUP_INTERVAL: u64 = 60;

pub async fn init(
    db: PgPool,
    tx: broadcast::Sender<live::LiveEvent>,
    state: LiveState,
) -> Result<(), Box<dyn Error>> {
    let cors = cors::init();

    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)
            .burst_size(8)
            .key_extractor(SmartIpKeyExtractor)
            .finish()
            .unwrap(),
    );

    let governor_limiter = governor_conf.limiter().clone();
    let interval = Duration::from_secs(CLEANUP_INTERVAL);

    thread::spawn(move || loop {
        thread::sleep(interval);
        tracing::info!("rate limiting storage size: {}", governor_limiter.len());
        governor_limiter.retain_recent();
    });

    let governor = GovernorLayer {
        config: governor_conf,
    };

    let app_state = Arc::new(AppState { tx, state, db });

    let app = Router::new()
        .route("/api/sse", get(live::sse_handler))
        .route("/api/health", get(health::check))
        .layer(cors)
        .layer(governor)
        .with_state(app_state)
        .into_make_service_with_connect_info::<SocketAddr>();

    let listener = tokio::net::TcpListener::bind(addr())
        .await
        .expect("failed to bind to port");

    axum::serve(listener, app)
        .await
        .expect("failed to serve http server");

    Ok(())
}
