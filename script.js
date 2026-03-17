// script.js (adaptado para 4 etapas y nuevo carrusel de imágenes)
document.addEventListener('DOMContentLoaded', function () {
    // ==================== LISTA DE ESTADOS DESDE API INEGI ====================
    // API de Catálogo Geográfico Abierto de INEGI
    const estadoSelect = document.getElementById('estado');

    // Cargar estados al iniciar
    async function cargarEstados() {
        try {
            // Se agrega alert de UI o feedback
            const optionLoading = document.createElement('option');
            optionLoading.value = "";
            optionLoading.textContent = "Cargando estados...";
            estadoSelect.appendChild(optionLoading);

            const response = await fetch('https://gaia.inegi.org.mx/wscatgeo/mgee/');
            const data = await response.json();

            estadoSelect.innerHTML = '<option value="">Seleccione estado</option>'; // Limpiar

            if (data && data.datos) {
                // Ordenar alfabéticamente
                const estadosData = data.datos.sort((a, b) => a.nom_agee.localeCompare(b.nom_agee));

                estadosData.forEach(e => {
                    const option = document.createElement('option');
                    // Usamos la clave del estado (cve_agee) como value para consultar luego los municipios
                    option.value = e.cve_agee;
                    option.textContent = e.nom_agee.toUpperCase();
                    // Guardamos el nombre real para cualquier uso futuro
                    option.dataset.nombre = e.nom_agee.toUpperCase();
                    estadoSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error("Error al cargar estados:", error);
            estadoSelect.innerHTML = '<option value="">Error al cargar estados</option>';
        }
    }

    // Iniciar carga
    cargarEstados();

    // ==================== LISTA DE MUNICIPIOS DESDE API INEGI ====================
    // Actualizar datalist de municipios al cambiar el estado
    estadoSelect.addEventListener('change', async function() {
        const estadoCve = this.value; // cve_agee del estado
        const datalistMunicipios = document.getElementById('municipios-list');
        const datalistMunicipiosCp = document.getElementById('municipios-cp-list');
        const inputMunicipio = document.getElementById('municipio1');
        
        datalistMunicipios.innerHTML = ''; // Limpiar opciones anteriores
        if (datalistMunicipiosCp) datalistMunicipiosCp.innerHTML = ''; // limpiar sugerencias por CP
        inputMunicipio.value = ''; // Limpiar el input al cambiar de estado
        // Si el municipio venía por CP, regresamos el datalist al de estado
        if (inputMunicipio && inputMunicipio.getAttribute('list') === 'municipios-cp-list') {
            inputMunicipio.setAttribute('list', 'municipios-list');
        }
        
        if (!estadoCve) return; // Si seleccionó la opción por defecto, no hacer nada

        inputMunicipio.placeholder = "Cargando municipios...";
        
        try {
            const response = await fetch(`https://gaia.inegi.org.mx/wscatgeo/mgem/${estadoCve}`);
            const data = await response.json();
            
            if (data && data.datos) {
                // Ordenar alfabéticamente
                const municipiosData = data.datos.sort((a, b) => a.nom_agem.localeCompare(b.nom_agem));
                
                municipiosData.forEach(mun => {
                    const option = document.createElement('option');
                    option.value = mun.nom_agem.toUpperCase();
                    datalistMunicipios.appendChild(option);
                });
                inputMunicipio.placeholder = "Ej. Tuxtla Gutiérrez";
            } else {
                inputMunicipio.placeholder = "Error al obtener municipios";
            }
        } catch (error) {
            console.error("Error al cargar municipios:", error);
            inputMunicipio.placeholder = "Error de conexión";
        }
    });

// ==================== CP -> MUNICIPIO / COLONIA (AUTOCOMPLETADO) ====================
const cpInputEtapa2 = document.getElementById('codigoPostal');
const cpStatus = document.getElementById('cpStatus');
const coloniaInput = document.getElementById('colonia');
const datalistColonias = document.getElementById('colonias-list');
const datalistMunicipios = document.getElementById('municipios-list');
const datalistMunicipiosCp = document.getElementById('municipios-cp-list');
const municipioCpSelect = document.getElementById('municipioCpSelect');
const coloniaCpSelect = document.getElementById('coloniaCpSelect');
const municipioInputGlobal = document.getElementById('municipio1');

const CP_LOOKUP_URL = 'https://sepomex.icalialabs.com/api/v1/zip_codes?zip_code=';
let cpLookupAbortController = null;

function setCpStatus(texto, isError = false) {
    if (!cpStatus) return;
    cpStatus.textContent = texto;
    cpStatus.style.color = isError ? '#b42318' : '#6c757d';
}

function uniqUpper(arr) {
    return Array.from(new Set(arr.map(v => String(v || '').trim()).filter(Boolean).map(v => v.toUpperCase())));
}

function fillDatalist(datalistEl, values) {
    if (!datalistEl) return;
    datalistEl.innerHTML = '';
    values.forEach(v => {
        const option = document.createElement('option');
        option.value = v;
        datalistEl.appendChild(option);
    });
}

function fillSelect(selectEl, values, labelPlural) {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    const optPlaceholder = document.createElement('option');
    optPlaceholder.value = '';
    optPlaceholder.textContent = `Selecciona ${labelPlural}...`;
    selectEl.appendChild(optPlaceholder);

    values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });

    const optManual = document.createElement('option');
    optManual.value = '__MANUAL__';
    optManual.textContent = 'Capturar manualmente';
    selectEl.appendChild(optManual);
}

function showSelect(selectEl, show) {
    if (!selectEl) return;
    selectEl.style.display = show ? 'block' : 'none';
}

function clearCpSuggestions() {
    fillDatalist(datalistColonias, []);
    fillDatalist(datalistMunicipiosCp, []);
    if (municipioCpSelect) municipioCpSelect.innerHTML = '';
    if (coloniaCpSelect) coloniaCpSelect.innerHTML = '';
    showSelect(municipioCpSelect, false);
    showSelect(coloniaCpSelect, false);

    // Rehabilitar edición manual de estado y municipio cuando se limpian sugerencias
    if (estadoSelect) {
        estadoSelect.disabled = false;
    }
    if (municipioInputGlobal) {
        municipioInputGlobal.readOnly = false;
    }
}

async function lookupCpAndAutofill(cp) {
    if (!/^\d{5}$/.test(cp)) return;

    if (cpLookupAbortController) cpLookupAbortController.abort();
    cpLookupAbortController = new AbortController();

    setCpStatus('Buscando colonia y municipio por CP...');
    clearCpSuggestions();

    try {
        const resp = await fetch(`${CP_LOOKUP_URL}${encodeURIComponent(cp)}`, { signal: cpLookupAbortController.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        const zipCodes = Array.isArray(data && data.zip_codes) ? data.zip_codes : [];
        if (zipCodes.length === 0) {
            setCpStatus('No encontramos datos para este CP. Puedes capturar municipio y colonia manualmente.', true);
            // Volver a sugerencias de municipio por estado (si existen)
            const municipioInput = document.getElementById('municipio1');
            if (municipioInput) municipioInput.setAttribute('list', 'municipios-list');
            return;
        }

        const municipios = uniqUpper(zipCodes.map(z => z.d_mnpio));
        const colonias = uniqUpper(zipCodes.map(z => z.d_asenta));

        // Estado desde CP (primer registro)
        const estadoNombre = String(zipCodes[0]?.d_estado || '').toUpperCase();
        if (estadoSelect && estadoNombre) {
            // Buscar opción cuyo texto coincida con el nombre del estado
            let encontrado = false;
            for (let i = 0; i < estadoSelect.options.length; i++) {
                const opt = estadoSelect.options[i];
                const nombreOpt = (((opt.dataset && opt.dataset.nombre) || opt.textContent) || '').toUpperCase();
                if (nombreOpt === estadoNombre) {
                    estadoSelect.selectedIndex = i;
                    encontrado = true;
                    break;
                }
            }
            if (encontrado) {
                // Bloquear cambios de estado cuando viene del CP
                estadoSelect.disabled = true;
            } else {
                // Si no encontramos coincidencia, permitir selección manual
                estadoSelect.disabled = false;
            }
        }

        // Municipio por CP: autollenar y bloquear edición
        fillDatalist(datalistMunicipiosCp, municipios);
        const municipioInput = document.getElementById('municipio1');
        if (municipioInput) {
            municipioInput.setAttribute('list', 'municipios-cp-list');
            if (municipios.length >= 1) {
                municipioInput.value = municipios[0];
                municipioInput.readOnly = true;
                showSelect(municipioCpSelect, false);
            } else {
                municipioInput.readOnly = false;
            }
        }

        // Colonias por CP: mantener solo el desplegable externo (select)
        fillDatalist(datalistColonias, []); // ya no usamos datalist interno
        if (coloniaInput) {
            if (colonias.length > 1) {
                fillSelect(coloniaCpSelect, colonias, 'una colonia');
                showSelect(coloniaCpSelect, true);
            } else {
                showSelect(coloniaCpSelect, false);
                if (colonias.length === 1) coloniaInput.value = colonias[0];
            }
        }

        const msgExtra = colonias.length > 1 ? 'Selecciona una colonia de la lista o escríbela manualmente.' : '';
        setCpStatus(`CP válido. Encontramos ${colonias.length} colonia(s). ${msgExtra}`.trim());
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error('Error lookup CP:', err);
        setCpStatus('No se pudo consultar el CP (sin conexión). Puedes capturar municipio y colonia manualmente.', true);
        const municipioInput = document.getElementById('municipio1');
        if (municipioInput) municipioInput.setAttribute('list', 'municipios-list');
    }
}

if (cpInputEtapa2) {
    cpInputEtapa2.addEventListener('blur', (e) => {
        const cp = String(e.target.value || '').trim();
        lookupCpAndAutofill(cp);
    });
    cpInputEtapa2.addEventListener('input', (e) => {
        const cp = String(e.target.value || '').trim();
        if (cp.length === 5) lookupCpAndAutofill(cp);
        if (cp.length < 5) {
            setCpStatus('Código postal a 5 dígitos');
            clearCpSuggestions();
        }
    });
}

if (municipioCpSelect) {
    municipioCpSelect.addEventListener('change', (e) => {
        const v = String(e.target.value || '');
        const municipioInput = document.getElementById('municipio1');
        if (!municipioInput) return;
        if (v === '__MANUAL__') {
            municipioInput.value = '';
            municipioInput.focus();
            return;
        }
        if (v) municipioInput.value = v;
    });
}

if (coloniaCpSelect) {
    coloniaCpSelect.addEventListener('change', (e) => {
        const v = String(e.target.value || '');
        if (!coloniaInput) return;
        if (v === '__MANUAL__') {
            coloniaInput.value = '';
            coloniaInput.focus();
            return;
        }
        if (v) coloniaInput.value = v;
    });
}

// ==================== PLAZOS EN MESES (DATALIST UI) ====================
function generarOpcionesDatalist() {
    const datalist = document.getElementById('plazo-list');
    const valoresComunes = [1, 3, 6, 9, 12, 18, 24, 36, 48, 60, 72, 84, 96, 100];

    if (datalist) {
        datalist.innerHTML = '';
        valoresComunes.forEach(valor => {
            const option = document.createElement('option');
            option.value = valor;
            datalist.appendChild(option);
        });
    }
}
generarOpcionesDatalist();

// Elementos de etapas
const etapa1 = document.getElementById('etapa1');
const etapa2 = document.getElementById('etapa2');
const etapa3 = document.getElementById('etapa3');
const etapa4 = document.getElementById('etapa4');
const steps = document.querySelectorAll('.step');

// Elementos del NIP y validación
const btnEnviarNIP = document.getElementById('btnEnviarNIP');
const campoNIP = document.getElementById('nip');
const telefonoInput = document.getElementById('telefono');
const autorizacionCheckbox = document.getElementById('autorizacion');
const btnSolicitarCredito = document.getElementById('btnSolicitarCredito');

// Modal
const modal = document.getElementById('modalNIP');
const closeBtn = document.querySelector('.close');
const btnCerrarModal = document.getElementById('cerrarModal');
const telefonoModal = document.getElementById('telefonoModal');

// Variables de estado
let nipEnviado = false;
let avisoAceptado = false;
let terminosAceptados = false;
let metodoEnvio = 'whatsapp'; // Por defecto

// ==================== CARRUSEL DE PRODUCTOS CON IMÁGENES ====================
function inicializarCarrusel() {
    const carrusel = document.getElementById('carruselProductos');
    const indicatorsContainer = document.getElementById('carruselIndicators');
    const prevBtn = document.getElementById('carruselPrevBtn');
    const nextBtn = document.getElementById('carruselNextBtn');

    // Lista de productos (solo nombre y ruta de imagen)
    const productos = [
        { nombre: 'C-MOVIL', imagen: 'c-movil.jpeg' },
        { nombre: 'C-FACIL', imagen: 'c-facil.jpeg' },
        { nombre: 'C-ESPECIAL', imagen: 'c-especial.jpeg' },
        { nombre: 'C-COSECHA', imagen: 'c-cosecha.jpeg' },
        { nombre: 'C-LIQUIDEZ', imagen: 'c-liquidez.jpeg' },
        { nombre: 'C-MUJER', imagen: 'c-mujer.jpeg' },
        { nombre: 'C-CREDICONTADO', imagen: 'credicontado.jpeg' },
        { nombre: 'C-DISTRIBUIDOR', imagen: 'c-distribuidor.jpeg' },
        { nombre: 'C-AUTO', imagen: 'c-auto.jpeg' }
    ];

    // Limpiar contenedores
    carrusel.innerHTML = '';
    indicatorsContainer.innerHTML = '';

    // Crear tarjetas de producto con imagen desde carpeta img/
    productos.forEach((prod, index) => {
        const card = document.createElement('div');
        card.className = 'producto-card';

        // Ruta de la imagen (sin './')
        const imgSrc = `img/${prod.imagen}`;

        card.innerHTML = `
                <img src="${imgSrc}" alt="${prod.nombre}" class="producto-imagen" onerror="this.onerror=null; this.src='https://via.placeholder.com/200x200?text=${prod.nombre}'">
                <div class="producto-titulo">${prod.nombre}</div>
            `;
        carrusel.appendChild(card);

        // Crear indicador
        const indicator = document.createElement('span');
        indicator.className = `indicator ${index === 0 ? 'active' : ''}`;
        indicator.dataset.index = index;
        indicator.addEventListener('click', () => goToSlide(index));
        indicatorsContainer.appendChild(indicator);
    });

    let currentIndex = 0;
    const totalSlides = productos.length;

    // Función para actualizar la posición del carrusel y cantidad de items a mostrar
    function updateCarousel() {
        // Determinar cuántos items se muestran dependiendo del ancho
        let itemsToShow = 1;
        if (window.innerWidth >= 768) itemsToShow = 3;
        else if (window.innerWidth >= 540) itemsToShow = 2;

        // Ajustar el width de los cards dinámicamente según itemsToShow
        const gap = 15; // px gap between items
        const totalGapSpace = gap * (itemsToShow - 1);

        document.querySelectorAll('.producto-card').forEach(card => {
            // Calculation: (100% - totalGapSpace) / itemsToShow
            card.style.flex = `0 0 calc((100% - ${totalGapSpace}px) / ${itemsToShow})`;
            card.style.maxWidth = `calc((100% - ${totalGapSpace}px) / ${itemsToShow})`;
        });

        const maxIndex = Math.max(0, totalSlides - itemsToShow);
        if (currentIndex > maxIndex) currentIndex = maxIndex;

        // Calcular cuánto desplazar (un card width + gap)
        const cardWidth = carrusel.children[0]?.offsetWidth || 0;
        const scrollDistance = currentIndex * (cardWidth + gap);

        carrusel.style.transform = `translateX(-${scrollDistance}px)`;

        // Actualizar indicadores (solo mostraremos los de las "páginas" o simplemente los puntos según índice limitados)
        document.querySelectorAll('.indicator').forEach((ind, idx) => {
            ind.classList.toggle('active', idx === currentIndex);
            // Ocultar indicadores extra si no tienen efecto
            if (idx > maxIndex) {
                ind.style.display = 'none';
            } else {
                ind.style.display = 'inline-block';
            }
        });

        // Actualizar botones
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === maxIndex;
    }

    // Función para ir a una diapositiva específica
    function goToSlide(index) {
        let itemsToShow = 1;
        if (window.innerWidth >= 768) itemsToShow = 3;
        else if (window.innerWidth >= 540) itemsToShow = 2;

        const maxIndex = Math.max(0, totalSlides - itemsToShow);

        if (index < 0) index = 0;
        if (index > maxIndex) index = maxIndex;

        currentIndex = index;
        updateCarousel();
    }

    // Event listeners para botones
    prevBtn.addEventListener('click', () => {
        goToSlide(currentIndex - 1);
    });

    nextBtn.addEventListener('click', () => {
        goToSlide(currentIndex + 1);
    });

    // Actualizar en resize
    window.addEventListener('resize', () => {
        updateCarousel();
    });

    // Inicializar
    setTimeout(updateCarousel, 100); // Pequeño delay para asegurar que los elementos tengan dimensiones
}
inicializarCarrusel();

// ==================== FUNCIONES DE NAVEGACIÓN ====================
function irAEtapa1() {
    etapa1.classList.add('active');
    etapa2.classList.remove('active');
    etapa3.classList.remove('active');
    etapa4.classList.remove('active');
    steps[0].classList.add('active');
    steps[1].classList.remove('active');
    steps[2].classList.remove('active');
    steps[3].classList.remove('active');
}

function irAEtapa2() {
    etapa1.classList.remove('active');
    etapa2.classList.add('active');
    etapa3.classList.remove('active');
    etapa4.classList.remove('active');
    steps[0].classList.remove('active');
    steps[1].classList.add('active');
    steps[2].classList.remove('active');
    steps[3].classList.remove('active');
}

function irAEtapa3() {
    etapa1.classList.remove('active');
    etapa2.classList.remove('active');
    etapa3.classList.add('active');
    etapa4.classList.remove('active');
    steps[0].classList.remove('active');
    steps[1].classList.remove('active');
    steps[2].classList.add('active');
    steps[3].classList.remove('active');
}

function irAEtapa4() {
    etapa1.classList.remove('active');
    etapa2.classList.remove('active');
    etapa3.classList.remove('active');
    etapa4.classList.add('active');
    steps[0].classList.remove('active');
    steps[1].classList.remove('active');
    steps[2].classList.remove('active');
    steps[3].classList.add('active');
}

// Botones "Anterior"
document.getElementById('btnAnterior2').addEventListener('click', irAEtapa1);
document.getElementById('btnAnterior3').addEventListener('click', irAEtapa2);

// ==================== ETAPA 1: VALIDACIÓN DE CAMPOS Y BOTONES DE ACEPTACIÓN ====================
const btnContinuar1 = document.getElementById('btnContinuar1');
const btnAceptarAviso = document.getElementById('aceptarAviso');
const btnAceptarTerminos = document.getElementById('aceptarTerminos');
const ineFile = document.getElementById('ineFile');
const ineTraseraFile = document.getElementById('ineTraseraFile');

// Función para verificar si todos los campos requeridos de etapa1 están llenos
function camposPersonalesCompletos() {
    const nombre = document.getElementById('nombre').value.trim();
    const apellidoPaterno = document.getElementById('apellidoPaterno').value.trim();
    const apellidoMaterno = document.getElementById('apellidoMaterno').value.trim();
    const fechaNacimiento = document.getElementById('fechaNacimiento').value;
    const estadoCivil = document.getElementById('estadoCivil').value;
    const genero = document.getElementById('genero').value;
    const ineSubido = ineFile.files.length > 0;
    const ineTraseraSubido = ineTraseraFile.files.length > 0;

    return nombre && apellidoPaterno && apellidoMaterno && fechaNacimiento && estadoCivil && genero && ineSubido && ineTraseraSubido;
}

// Función para habilitar/deshabilitar el botón Continuar de etapa1
function actualizarBotonContinuar1() {
    if (camposPersonalesCompletos() && avisoAceptado && terminosAceptados) {
        btnContinuar1.disabled = false;
    } else {
        btnContinuar1.disabled = true;
    }
}

// Eventos de los botones de aceptación
btnAceptarAviso.addEventListener('click', function () {
    if (!avisoAceptado) {
        avisoAceptado = true;
        btnAceptarAviso.classList.add('aceptado');
        btnAceptarAviso.textContent = 'Aviso Aceptado';
        btnAceptarAviso.disabled = true;
        actualizarBotonContinuar1();
    }
});

btnAceptarTerminos.addEventListener('click', function () {
    if (!terminosAceptados) {
        terminosAceptados = true;
        btnAceptarTerminos.classList.add('aceptado');
        btnAceptarTerminos.textContent = 'Términos Aceptados';
        btnAceptarTerminos.disabled = true;
        actualizarBotonContinuar1();
    }
});

// Eventos de los campos del formulario para actualizar el botón
const camposRequeridos = ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'fechaNacimiento', 'estadoCivil', 'genero'];
camposRequeridos.forEach(id => {
    document.getElementById(id).addEventListener('input', actualizarBotonContinuar1);
    document.getElementById(id).addEventListener('change', actualizarBotonContinuar1);
});

// Eventos para los archivos INE
ineFile.addEventListener('change', function (e) {
    if (this.files && this.files[0]) {
        const file = this.files[0];
        const fileSize = file.size / 1024 / 1024;

        if (fileSize > 5) {
            alert('El archivo no debe exceder los 5MB');
            this.value = '';
            document.getElementById('fileNameFrente').textContent = '';
            actualizarBotonContinuar1();
            return;
        }

        const fileType = file.type;
        if (!fileType.match('image.*') && !fileType.match('application/pdf')) {
            alert('Solo se permiten archivos de imagen (JPG, PNG) o PDF');
            this.value = '';
            document.getElementById('fileNameFrente').textContent = '';
            actualizarBotonContinuar1();
            return;
        }

        document.getElementById('fileNameFrente').textContent = `Frente: ${file.name}`;
    }
    actualizarBotonContinuar1();
});

ineTraseraFile.addEventListener('change', function (e) {
    if (this.files && this.files[0]) {
        const file = this.files[0];
        const fileSize = file.size / 1024 / 1024;

        if (fileSize > 5) {
            alert('El archivo no debe exceder los 5MB');
            this.value = '';
            document.getElementById('fileNameTrasera').textContent = '';
            actualizarBotonContinuar1();
            return;
        }

        const fileType = file.type;
        if (!fileType.match('image.*') && !fileType.match('application/pdf')) {
            alert('Solo se permiten archivos de imagen (JPG, PNG) o PDF');
            this.value = '';
            document.getElementById('fileNameTrasera').textContent = '';
            actualizarBotonContinuar1();
            return;
        }

        document.getElementById('fileNameTrasera').textContent = `Trasera: ${file.name}`;
    }
    actualizarBotonContinuar1();
});

// Envío del formulario de etapa 1
document.getElementById('formPersonal').addEventListener('submit', function (e) {
    e.preventDefault();

    const nombre = document.getElementById('nombre').value.trim();
    const apellidoPaterno = document.getElementById('apellidoPaterno').value.trim();
    const apellidoMaterno = document.getElementById('apellidoMaterno').value.trim();
    const fechaNacimiento = document.getElementById('fechaNacimiento').value;
    const estadoCivil = document.getElementById('estadoCivil').value;
    const genero = document.getElementById('genero').value;
    const ineSubido = ineFile.files.length > 0;
    const ineTraseraSubido = ineTraseraFile.files.length > 0;

    if (!nombre || !apellidoPaterno || !apellidoMaterno || !fechaNacimiento || !estadoCivil || !genero || !ineSubido || !ineTraseraSubido) {
        alert('Por favor, complete todos los campos requeridos y suba ambas caras de su INE.');
        return;
    }

    if (!avisoAceptado || !terminosAceptados) {
        alert('Debe aceptar tanto el Aviso de Privacidad como los Términos y Condiciones para continuar.');
        return;
    }

    // Calcular edad a partir de fecha de nacimiento
    const hoy = new Date();
    const nacimiento = new Date(fechaNacimiento);
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
        edad--;
    }

    if (edad < 18) {
        alert('Debe ser mayor de 18 años para continuar');
        return;
    }

    irAEtapa2();
});

// ==================== ETAPA 2: CÁLCULO AUTOMÁTICO DE CANTIDAD DE PAGOS ====================
const plazoInput = document.getElementById('plazo');
const periodicidadSelect = document.getElementById('periodicidad');
const cantidadPagosInput = document.getElementById('cantidadPagos');

function calcularCantidadPagos() {
    const plazoMeses = parseInt(plazoInput.value);
    const periodicidadValor = parseInt(periodicidadSelect.value);

    if (!isNaN(plazoMeses) && plazoMeses > 0 && !isNaN(periodicidadValor) && periodicidadValor > 0) {
        const plazoAnios = plazoMeses / 12;
        const cantidadCalculada = (plazoAnios * 364) / periodicidadValor;
        cantidadPagosInput.value = Math.round(cantidadCalculada);
    } else {
        cantidadPagosInput.value = '';
    }
}

plazoInput.addEventListener('input', calcularCantidadPagos);
periodicidadSelect.addEventListener('change', calcularCantidadPagos);

// ==================== ETAPA 2 -> ETAPA 3 ====================
document.getElementById('formCredito').addEventListener('submit', function (e) {
    e.preventDefault();

    // El valor de estadoSelect ahora es la clave (cve). Si quisieras enviar el nombre a tu backend, usa:
    // const estado = document.getElementById('estado').options[document.getElementById('estado').selectedIndex].dataset.nombre;
    const estado = document.getElementById('estado').value;
    const municipio = document.getElementById('municipio1').value.trim();
    const calle = document.getElementById('calle').value.trim();
    const noExterior = document.getElementById('noExterior').value.trim();
    const colonia = document.getElementById('colonia').value.trim();
    const codigoPostal = document.getElementById('codigoPostal').value.trim();
    const producto = document.getElementById('producto').value;
    const monto = document.getElementById('monto').value;
    const plazo = document.getElementById('plazo').value;
    const periodicidad = document.getElementById('periodicidad').value;
    const cantidadPagos = document.getElementById('cantidadPagos').value;

    if (!estado || !municipio || !calle || !noExterior || !colonia || !codigoPostal || !producto || !monto || !plazo || !periodicidad || !cantidadPagos) {
        alert('Por favor, complete todos los campos obligatorios de ubicación, dirección y crédito');
        return;
    }

    const cpRegex = /^\d{5}$/;
    if (!cpRegex.test(codigoPostal)) {
        alert('El código postal debe tener exactamente 5 dígitos');
        return;
    }

    if (monto < 1000 || monto > 500000) {
        alert('El monto debe estar entre $1,000 y $500,000 MXN');
        return;
    }

    if (!Number.isInteger(Number(plazo)) || plazo < 1 || plazo > 100) {
        alert('El plazo debe ser un número entero entre 1 y 100 meses');
        return;
    }

    if (cantidadPagos <= 0) {
        alert('La cantidad de pagos calculada no es válida. Revise el plazo y la periodicidad.');
        return;
    }

    irAEtapa3();
});

// ==================== ETAPA 3 (lógica para Solicitar Crédito) ====================
function validarHabilitacionSolicitar() {
    const actividadEconomica = document.getElementById('actividadEconomica').value;
    const curp = document.getElementById('curp').value;
    const rfc = document.getElementById('rfc').value;
    const telefono = telefonoInput.value;
    const nip = campoNIP.value;
    const autorizacion = autorizacionCheckbox.checked;

    if (actividadEconomica && curp && rfc && telefono && nip && autorizacion && nipEnviado && campoNIP.value.length === 4) {
        btnSolicitarCredito.disabled = false;
    } else {
        btnSolicitarCredito.disabled = true;
    }
}

// Manejo de selección de método de envío
const btnWhatsApp = document.getElementById('btnWhatsApp');
const btnSMS = document.getElementById('btnSMS');

btnWhatsApp.addEventListener('click', function () {
    btnWhatsApp.classList.add('selected');
    btnSMS.classList.remove('selected');
    metodoEnvio = 'whatsapp';
});

btnSMS.addEventListener('click', function () {
    btnSMS.classList.add('selected');
    btnWhatsApp.classList.remove('selected');
    metodoEnvio = 'sms';
});

// Envío de NIP
btnEnviarNIP.addEventListener('click', function () {
    const telefono = telefonoInput.value;

    if (!telefono) {
        alert('Por favor, ingrese su número telefónico');
        return;
    }

    const telefonoRegex = /^\d{10}$/;
    if (!telefonoRegex.test(telefono)) {
        alert('El número telefónico debe tener 10 dígitos');
        return;
    }

    telefonoModal.textContent = telefono;

    const metodoTexto = metodoEnvio === 'whatsapp' ? 'WhatsApp' : 'SMS';
    modal.querySelector('.modal-body p:first-of-type').innerHTML = `Hemos enviado un NIP de verificación por ${metodoTexto} al número:`;

    modal.style.display = 'block';

    campoNIP.disabled = false;
    campoNIP.placeholder = 'Ingrese el NIP de 4 dígitos';
    campoNIP.focus();

    nipEnviado = true;
    validarHabilitacionSolicitar();
});

// Listeners para campos de etapa 3
document.getElementById('actividadEconomica').addEventListener('change', validarHabilitacionSolicitar);
document.getElementById('curp').addEventListener('input', validarHabilitacionSolicitar);
document.getElementById('rfc').addEventListener('input', validarHabilitacionSolicitar);
telefonoInput.addEventListener('input', validarHabilitacionSolicitar);
campoNIP.addEventListener('input', validarHabilitacionSolicitar);
autorizacionCheckbox.addEventListener('change', validarHabilitacionSolicitar);

// Solicitar Crédito
btnSolicitarCredito.addEventListener('click', function () {
    const actividadEconomica = document.getElementById('actividadEconomica').value;
    const curp = document.getElementById('curp').value;
    const rfc = document.getElementById('rfc').value;
    const telefono = telefonoInput.value;
    const nip = campoNIP.value;
    const autorizacion = autorizacionCheckbox.checked;

    if (!actividadEconomica || !curp || !rfc || !telefono || !nip || !autorizacion) {
        alert('Por favor, complete todos los campos requeridos y autorice la consulta');
        return;
    }

    if (curp.length !== 18) {
        alert('El CURP debe tener 18 caracteres');
        return;
    }

    if (rfc.length < 12 || rfc.length > 13) {
        alert('El RFC debe tener 12 o 13 caracteres');
        return;
    }

    const telefonoRegex = /^\d{10}$/;
    if (!telefonoRegex.test(telefono)) {
        alert('El teléfono debe tener 10 dígitos');
        return;
    }

    if (nip !== '1234') {
        alert('NIP incorrecto. Para fines demostrativos, use: 1234');
        return;
    }

    alert('✓ Consulta autorizada con Círculo de Crédito exitosamente. Su solicitud está siendo procesada.');

    irAEtapa4();
});

// ==================== CERRAR MODAL ====================
function cerrarModal() {
    modal.style.display = 'none';
}

closeBtn.addEventListener('click', cerrarModal);
btnCerrarModal.addEventListener('click', cerrarModal);

window.addEventListener('click', function (event) {
    if (event.target === modal) {
        cerrarModal();
    }
});

// ==================== VALIDACIONES Y FORMATO ====================
// Convertir a mayúsculas y permitir solo caracteres válidos en nombres
const nombreInputs = ['nombre', 'segundoNombre', 'apellidoPaterno', 'apellidoMaterno'];
nombreInputs.forEach(id => {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.addEventListener('input', function (e) {
            e.target.value = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s-]/g, '').toUpperCase();
        });
    }
});

// CURP y RFC a mayúsculas
document.getElementById('curp').addEventListener('input', function (e) {
    e.target.value = e.target.value.toUpperCase();
});
document.getElementById('rfc').addEventListener('input', function (e) {
    e.target.value = e.target.value.toUpperCase();
});

// Teléfono solo dígitos
telefonoInput.addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '');
});

// NIP solo dígitos, máximo 4
campoNIP.addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
});

// ==================== VALIDACIONES PARA ETAPA 2 ====================
const municipioInput = document.getElementById('municipio1');
if (municipioInput) {
    municipioInput.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.-]/g, '').toUpperCase();
    });
}

const textoDireccionIds = ['calle', 'colonia'];
textoDireccionIds.forEach(id => {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.addEventListener('input', function (e) {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.-]/g, '').toUpperCase();
        });
    }
});

const noExterior = document.getElementById('noExterior');
if (noExterior) {
    noExterior.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    });
}

const noInterior = document.getElementById('noInterior');
if (noInterior) {
    noInterior.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    });
}

const cpInput = document.getElementById('codigoPostal');
if (cpInput) {
    cpInput.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 5);
    });
}

const entreCalles = document.getElementById('entreCalles');
if (entreCalles) {
    entreCalles.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s,.-]/g, '').toUpperCase();
    });
}

console.log('Sistema de crédito actualizado con subida de ambas caras INE, carrusel de productos con imágenes, navegación manual y animación mejorada. NIP demostrativo: 1234');
});