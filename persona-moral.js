// persona-moral.js — flujo persona moral (4 pasos + resultado)
document.addEventListener('DOMContentLoaded', function () {
    const CP_LOOKUP_URL = 'https://sepomex.icalialabs.com/api/v1/zip_codes?zip_code=';

    const estadoEmpresaSelect = document.getElementById('estadoEmpresa');
    const estadoRepSelect = document.getElementById('estadoRep');
    const municipioEmpresaSelect = document.getElementById('municipioEmpresa');
    const municipioRepSelect = document.getElementById('municipioRep');

    function fillSelectBasic(selectEl, values, placeholder) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        const optPlaceholder = document.createElement('option');
        optPlaceholder.value = '';
        optPlaceholder.textContent = placeholder || 'Seleccione...';
        selectEl.appendChild(optPlaceholder);
        values.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            selectEl.appendChild(opt);
        });
    }

    async function cargarMunicipiosPorEstado(estadoCve, municipioSelect) {
        if (!municipioSelect) return;
        fillSelectBasic(municipioSelect, [], 'Cargando municipios...');
        municipioSelect.disabled = false;
        if (!estadoCve) {
            fillSelectBasic(municipioSelect, [], 'Seleccione municipio');
            return;
        }
        try {
            const response = await fetch(`https://gaia.inegi.org.mx/wscatgeo/mgem/${estadoCve}`);
            const data = await response.json();
            if (data && data.datos) {
                const municipiosData = data.datos
                    .map(m => String(m.nom_agem || '').trim())
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b))
                    .map(v => v.toUpperCase());
                fillSelectBasic(municipioSelect, municipiosData, 'Seleccione municipio');
            } else {
                fillSelectBasic(municipioSelect, [], 'Error al obtener municipios');
            }
        } catch (error) {
            console.error('Error al cargar municipios:', error);
            fillSelectBasic(municipioSelect, [], 'Error de conexión');
        }
    }

    async function cargarEstadosEnAmbosSelects() {
        const selects = [estadoEmpresaSelect, estadoRepSelect].filter(Boolean);
        if (selects.length === 0) return;
        try {
            selects.forEach(s => {
                s.innerHTML = '<option value="">Cargando estados...</option>';
            });
            const response = await fetch('https://gaia.inegi.org.mx/wscatgeo/mgee/');
            const data = await response.json();
            const htmlBase = '<option value="">Seleccione estado</option>';
            selects.forEach(s => {
                s.innerHTML = htmlBase;
            });
            if (data && data.datos) {
                const estadosData = data.datos.sort((a, b) => a.nom_agee.localeCompare(b.nom_agee));
                estadosData.forEach(e => {
                    selects.forEach(s => {
                        const option = document.createElement('option');
                        option.value = e.cve_agee;
                        option.textContent = e.nom_agee.toUpperCase();
                        option.dataset.nombre = e.nom_agee.toUpperCase();
                        s.appendChild(option);
                    });
                });
            }
        } catch (error) {
            console.error('Error al cargar estados:', error);
            selects.forEach(s => { s.innerHTML = '<option value="">Error al cargar estados</option>'; });
        }
    }

    cargarEstadosEnAmbosSelects();

    if (estadoEmpresaSelect) {
        estadoEmpresaSelect.addEventListener('change', function () {
            cargarMunicipiosPorEstado(this.value, municipioEmpresaSelect);
        });
    }
    if (estadoRepSelect) {
        estadoRepSelect.addEventListener('change', function () {
            cargarMunicipiosPorEstado(this.value, municipioRepSelect);
        });
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

    function crearCpLookup(config) {
        const {
            cpInput,
            cpStatusEl,
            coloniaInput,
            datalistColonias,
            estadoSelect,
            municipioSelect,
            defaultHint
        } = config;

        let abortController = null;

        function setCpStatus(texto, isError = false) {
            if (!cpStatusEl) return;
            cpStatusEl.textContent = texto;
            cpStatusEl.style.color = isError ? '#b42318' : '#6c757d';
        }

        function clearCpSuggestions() {
            fillDatalist(datalistColonias, []);
            if (estadoSelect) estadoSelect.disabled = false;
            if (municipioSelect) {
                municipioSelect.disabled = false;
                if (estadoSelect && estadoSelect.value) {
                    try { cargarMunicipiosPorEstado(estadoSelect.value, municipioSelect); } catch (_) {}
                }
            }
        }

        async function lookupCpAndAutofill(cp) {
            if (!/^\d{5}$/.test(cp)) return;
            if (abortController) abortController.abort();
            abortController = new AbortController();
            setCpStatus('Buscando colonia y municipio por CP...');
            clearCpSuggestions();

            try {
                const resp = await fetch(`${CP_LOOKUP_URL}${encodeURIComponent(cp)}`, { signal: abortController.signal });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                const zipCodes = Array.isArray(data && data.zip_codes) ? data.zip_codes : [];
                if (zipCodes.length === 0) {
                    setCpStatus('No encontramos datos para este CP. Captura manualmente.', true);
                    if (estadoSelect && estadoSelect.value) {
                        try { cargarMunicipiosPorEstado(estadoSelect.value, municipioSelect); } catch (_) {}
                    }
                    return;
                }

                const municipios = uniqUpper(zipCodes.map(z => z.d_mnpio));
                const colonias = uniqUpper(zipCodes.map(z => z.d_asenta));
                const estadoNombre = String(zipCodes[0]?.d_estado || '').toUpperCase();

                if (estadoSelect && estadoNombre) {
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
                    estadoSelect.disabled = !!encontrado;
                }

                if (municipioSelect) {
                    fillSelectBasic(municipioSelect, municipios, 'Seleccione municipio');
                    if (municipios.length >= 1) municipioSelect.value = municipios[0];
                    municipioSelect.disabled = municipios.length === 1;
                }

                fillDatalist(datalistColonias, colonias);
                if (coloniaInput && colonias.length === 1) coloniaInput.value = colonias[0];

                const msgExtra = colonias.length > 1 ? ' Elige colonia de la lista o escribe manualmente.' : '';
                setCpStatus(`CP válido. ${colonias.length} colonia(s).${msgExtra}`.trim());
            } catch (err) {
                if (err && err.name === 'AbortError') return;
                console.error('Error lookup CP:', err);
                setCpStatus('No se pudo consultar el CP. Captura manualmente.', true);
                if (estadoSelect && estadoSelect.value) {
                    try { cargarMunicipiosPorEstado(estadoSelect.value, municipioSelect); } catch (_) {}
                }
            }
        }

        if (cpInput) {
            cpInput.addEventListener('blur', (e) => {
                const cp = String(e.target.value || '').trim();
                lookupCpAndAutofill(cp);
            });
            cpInput.addEventListener('input', (e) => {
                const cp = String(e.target.value || '').trim();
                e.target.value = cp.replace(/\D/g, '').substring(0, 5);
                const c2 = e.target.value;
                if (c2.length === 5) lookupCpAndAutofill(c2);
                if (c2.length < 5) {
                    setCpStatus(defaultHint || 'Código postal a 5 dígitos');
                    clearCpSuggestions();
                }
            });
        }
    }

    crearCpLookup({
        cpInput: document.getElementById('cpEmpresa'),
        cpStatusEl: document.getElementById('cpStatusEmpresa'),
        coloniaInput: document.getElementById('coloniaEmpresa'),
        datalistColonias: document.getElementById('colonias-empresa-list'),
        estadoSelect: estadoEmpresaSelect,
        municipioSelect: municipioEmpresaSelect,
        defaultHint: 'Código postal a 5 dígitos'
    });

    crearCpLookup({
        cpInput: document.getElementById('cpRep'),
        cpStatusEl: document.getElementById('cpStatusRep'),
        coloniaInput: document.getElementById('coloniaRep'),
        datalistColonias: document.getElementById('colonias-rep-list'),
        estadoSelect: estadoRepSelect,
        municipioSelect: municipioRepSelect,
        defaultHint: 'Código postal a 5 dígitos'
    });

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

    const etapa1 = document.getElementById('etapa1');
    const etapa2 = document.getElementById('etapa2');
    const etapa3 = document.getElementById('etapa3');
    const etapa4 = document.getElementById('etapa4');
    const steps = document.querySelectorAll('.step');
    const panelValidacion = document.getElementById('panelValidacion');
    const panelResultado = document.getElementById('panelResultado');

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
        if (panelValidacion) panelValidacion.style.display = 'block';
        if (panelResultado) panelResultado.style.display = 'none';
    }

    function mostrarResultado() {
        if (panelValidacion) panelValidacion.style.display = 'none';
        if (panelResultado) panelResultado.style.display = 'block';
    }

    const btnEnviarNIP = document.getElementById('btnEnviarNIP');
    const campoNIP = document.getElementById('nip');
    const telefonoInput = document.getElementById('telefono');
    const autorizacionCheckbox = document.getElementById('autorizacion');
    const btnSolicitarCredito = document.getElementById('btnSolicitarCredito');
    const modal = document.getElementById('modalNIP');
    const closeBtn = document.querySelector('.close');
    const btnCerrarModal = document.getElementById('cerrarModal');
    const telefonoModal = document.getElementById('telefonoModal');

    let nipEnviado = false;
    let avisoAceptado = false;
    let terminosAceptados = false;
    let metodoEnvio = 'whatsapp';

    function inicializarCarrusel() {
        const carrusel = document.getElementById('carruselProductos');
        const indicatorsContainer = document.getElementById('carruselIndicators');
        const prevBtn = document.getElementById('carruselPrevBtn');
        const nextBtn = document.getElementById('carruselNextBtn');
        const productoSelect = document.getElementById('producto');

        const productos = [
            { nombre: 'C-MOVIL', imagen: 'c-movil.jpeg', descripcion: 'Publico en general que desea un motocarro para transporte publico' },
            { nombre: 'C-FACIL', imagen: 'c-facil.jpeg', descripcion: 'Publico en general que desea un motocarro de carga o transporte privado' },
            { nombre: 'C-CREDICONTADO', imagen: 'credicontado.jpeg', descripcion: 'Publico en general que requiera financiamiento a corto plazo para el cierre de una compra.' },
            { nombre: 'C-EMPREDEDOR', imagen: 'c-emprendedor-nuevo.jpeg', descripcion: 'Personas duenas de mototaxi con actividad economica principal ser mototaxistas.' },
            { nombre: 'C-LIQUIDEZ', imagen: 'c-liquidez.jpeg', descripcion: 'Clientes activos que requieran un credito paralelo.' },
            { nombre: 'C-AUTO', imagen: 'c-auto.jpeg', descripcion: 'Publico en general' },
            { nombre: 'C-MUJER', imagen: 'c-mujer.jpeg', descripcion: 'Familiares mujer de los acreditados hasta segundo grado de consanguineidad.' },
            { nombre: 'C-COSECHA', imagen: 'c-cosecha.jpeg', descripcion: 'Sector agropecuario' }
        ];

        if (!carrusel || !indicatorsContainer) return;

        carrusel.innerHTML = '';
        indicatorsContainer.innerHTML = '';

        let productoSeleccionadoIndex = 0;

        function seleccionarProducto(index, sincronizarCarrusel = false) {
            if (index < 0 || index >= productos.length) return;
            productoSeleccionadoIndex = index;
            document.querySelectorAll('.producto-card').forEach((card, idx) => {
                card.classList.toggle('selected-producto', idx === productoSeleccionadoIndex);
            });
            if (productoSelect) productoSelect.value = productos[productoSeleccionadoIndex].nombre;
            if (sincronizarCarrusel) goToSlide(productoSeleccionadoIndex);
        }

        productos.forEach((prod, index) => {
            const card = document.createElement('div');
            card.className = 'producto-card';
            card.style.cursor = 'pointer';
            const imgSrc = `img/${prod.imagen}`;
            card.innerHTML = `
                <img src="${imgSrc}" alt="${prod.nombre}" class="producto-imagen" onerror="this.onerror=null; this.src='https://via.placeholder.com/200x200?text=${prod.nombre}'">
                <div class="producto-titulo">${prod.nombre}</div>
                <div class="producto-overlay">
                    <div class="producto-overlay-titulo">${prod.nombre}</div>
                    <div class="producto-overlay-desc">${prod.descripcion}</div>
                </div>
            `;
            card.addEventListener('click', () => seleccionarProducto(index, true));
            carrusel.appendChild(card);

            const indicator = document.createElement('span');
            indicator.className = `indicator ${index === 0 ? 'active' : ''}`;
            indicator.dataset.index = index;
            indicator.addEventListener('click', () => goToSlide(index));
            indicatorsContainer.appendChild(indicator);
        });

        let currentIndex = 0;
        const totalSlides = productos.length;

        function updateCarousel() {
            let itemsToShow = 1;
            if (window.innerWidth >= 768) itemsToShow = 3;
            else if (window.innerWidth >= 540) itemsToShow = 2;

            const gap = 15;
            const totalGapSpace = gap * (itemsToShow - 1);

            document.querySelectorAll('.producto-card').forEach(card => {
                card.style.flex = `0 0 calc((100% - ${totalGapSpace}px) / ${itemsToShow})`;
                card.style.maxWidth = `calc((100% - ${totalGapSpace}px) / ${itemsToShow})`;
            });

            const maxIndex = Math.max(0, totalSlides - itemsToShow);
            if (currentIndex > maxIndex) currentIndex = maxIndex;

            const cardWidth = carrusel.children[0]?.offsetWidth || 0;
            const scrollDistance = currentIndex * (cardWidth + gap);
            carrusel.style.transform = `translateX(-${scrollDistance}px)`;

            document.querySelectorAll('.indicator').forEach((ind, idx) => {
                ind.classList.toggle('active', idx === currentIndex);
                ind.style.display = idx > maxIndex ? 'none' : 'inline-block';
            });

            prevBtn.disabled = currentIndex === 0;
            nextBtn.disabled = currentIndex === maxIndex;
        }

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

        prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1));
        nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1));
        window.addEventListener('resize', () => updateCarousel());

        if (productoSelect) {
            productoSelect.addEventListener('change', function () {
                const nuevoIndex = productos.findIndex(p => p.nombre === this.value);
                if (nuevoIndex !== -1) seleccionarProducto(nuevoIndex, true);
            });
        }

        setTimeout(updateCarousel, 100);
        seleccionarProducto(0);
    }
    inicializarCarrusel();

    const btnContinuar1 = document.getElementById('btnContinuar1');
    const btnAceptarAviso = document.getElementById('aceptarAviso');
    const btnAceptarTerminos = document.getElementById('aceptarTerminos');
    const ineFrenteFile = document.getElementById('ineFrenteFile');
    const ineAtrasFile = document.getElementById('ineAtrasFile');

    function validarArchivo(fileInput, mostrarNombreEnId) {
        if (!fileInput) return;
        if (!fileInput.files || !fileInput.files[0]) {
            if (mostrarNombreEnId) document.getElementById(mostrarNombreEnId).textContent = '';
            return;
        }
        const file = fileInput.files[0];
        const fileSize = file.size / 1024 / 1024;
        if (fileSize > 5) {
            alert('El archivo no debe exceder los 5MB');
            fileInput.value = '';
            if (mostrarNombreEnId) document.getElementById(mostrarNombreEnId).textContent = '';
            return false;
        }
        const fileType = file.type;
        if (!fileType.match('image.*') && !fileType.match('application/pdf')) {
            alert('Solo se permiten archivos de imagen (JPG, PNG) o PDF');
            fileInput.value = '';
            if (mostrarNombreEnId) document.getElementById(mostrarNombreEnId).textContent = '';
            return false;
        }
        if (mostrarNombreEnId) document.getElementById(mostrarNombreEnId).textContent = file.name;
        return true;
    }

    function camposEtapa1Completos() {
        const razon = document.getElementById('razonSocial').value.trim();
        const rfc = document.getElementById('rfcEmpresa').value.trim();
        const sit = document.getElementById('situacionFiscal').value;
        const giro = document.getElementById('giroComercial').value.trim();
        const act = document.getElementById('actividadPreponderante').value.trim();
        const cp = document.getElementById('cpEmpresa').value.trim();
        const edo = estadoEmpresaSelect && estadoEmpresaSelect.value;
        const mun = municipioEmpresaSelect && municipioEmpresaSelect.value;
        const calle = document.getElementById('calleEmpresa').value.trim();
        const noe = document.getElementById('noExtEmpresa').value.trim();
        const col = document.getElementById('coloniaEmpresa').value.trim();
        return razon && rfc && sit && giro && act && cp.length === 5 && edo && mun && calle && noe && col;
    }

    function actualizarBotonContinuar1() {
        if (camposEtapa1Completos() && avisoAceptado && terminosAceptados) {
            btnContinuar1.disabled = false;
        } else {
            btnContinuar1.disabled = true;
        }
    }

    btnAceptarAviso.addEventListener('click', function () {
        if (!avisoAceptado) {
            avisoAceptado = true;
            btnAceptarAviso.classList.add('aceptado');
            btnAceptarAviso.textContent = 'Aviso aceptado';
            btnAceptarAviso.disabled = true;
            actualizarBotonContinuar1();
        }
    });

    btnAceptarTerminos.addEventListener('click', function () {
        if (!terminosAceptados) {
            terminosAceptados = true;
            btnAceptarTerminos.classList.add('aceptado');
            btnAceptarTerminos.textContent = 'Términos aceptados';
            btnAceptarTerminos.disabled = true;
            actualizarBotonContinuar1();
        }
    });

    ['razonSocial', 'rfcEmpresa', 'situacionFiscal', 'giroComercial', 'actividadPreponderante', 'cpEmpresa', 'calleEmpresa', 'noExtEmpresa', 'noIntEmpresa', 'coloniaEmpresa', 'entreCallesEmpresa'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', actualizarBotonContinuar1);
            el.addEventListener('change', actualizarBotonContinuar1);
        }
    });
    if (estadoEmpresaSelect) {
        estadoEmpresaSelect.addEventListener('change', actualizarBotonContinuar1);
    }
    if (municipioEmpresaSelect) {
        municipioEmpresaSelect.addEventListener('change', actualizarBotonContinuar1);
    }

    document.getElementById('formEmpresa').addEventListener('submit', function (e) {
        e.preventDefault();
        const rfcEmp = document.getElementById('rfcEmpresa').value.replace(/\s/g, '').toUpperCase();
        if (rfcEmp.length !== 12) {
            alert('El RFC de la empresa debe tener 12 caracteres.');
            return;
        }
        if (!avisoAceptado || !terminosAceptados) {
            alert('Debe aceptar el Aviso de Privacidad y los Términos y Condiciones.');
            return;
        }
        const cp = document.getElementById('cpEmpresa').value.trim();
        if (!/^\d{5}$/.test(cp)) {
            alert('El código postal debe tener 5 dígitos.');
            return;
        }
        irAEtapa2();
    });

    ineFrenteFile.addEventListener('change', function () {
        validarArchivo(this, 'fileNameIneFrente');
    });
    ineAtrasFile.addEventListener('change', function () {
        validarArchivo(this, 'fileNameIneAtras');
    });

    document.getElementById('formRepresentante').addEventListener('submit', function (e) {
        e.preventDefault();
        const fn = document.getElementById('fechaNacimiento').value;
        if (!fn) return;
        const hoy = new Date();
        const nac = new Date(fn);
        let edad = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
        if (edad < 18) {
            alert('El representante legal debe ser mayor de 18 años.');
            return;
        }
        if (!ineFrenteFile.files.length || !ineAtrasFile.files.length) {
            alert('Sube INE por ambos lados.');
            return;
        }
        const curpR = document.getElementById('curpRep').value.trim();
        if (curpR.length !== 18) {
            alert('CURP debe tener 18 caracteres.');
            return;
        }
        const cp = document.getElementById('cpRep').value.trim();
        if (!/^\d{5}$/.test(cp)) {
            alert('Código postal del domicilio del representante: 5 dígitos.');
            return;
        }
        if (!estadoRepSelect.value || !municipioRepSelect.value) {
            alert('Seleccione estado y municipio del representante.');
            return;
        }
        irAEtapa3();
    });

    document.getElementById('btnAnterior2').addEventListener('click', irAEtapa1);

    const plazoInput = document.getElementById('plazo');
    const periodicidadSelect = document.getElementById('periodicidad');
    const cantidadPagosInput = document.getElementById('cantidadPagos');

    function calcularCantidadPagos() {
        const plazoMeses = parseInt(plazoInput.value);
        const periodicidadValor = parseInt(periodicidadSelect.value);
        if (!isNaN(plazoMeses) && plazoMeses > 0 && !isNaN(periodicidadValor) && periodicidadValor > 0) {
            const plazoAnios = plazoMeses / 12;
            cantidadPagosInput.value = Math.round((plazoAnios * 364) / periodicidadValor);
        } else {
            cantidadPagosInput.value = '';
        }
    }
    plazoInput.addEventListener('input', calcularCantidadPagos);
    periodicidadSelect.addEventListener('change', calcularCantidadPagos);

    function copiarDatosRepAValidacion() {
        document.getElementById('curp').value = document.getElementById('curpRep').value;
        document.getElementById('rfc').value = document.getElementById('rfcRep').value;
        document.getElementById('email').value = document.getElementById('emailRep').value;
        document.getElementById('telefono').value = document.getElementById('telefonoRep').value;
    }

    document.getElementById('formCredito').addEventListener('submit', function (e) {
        e.preventDefault();
        const producto = document.getElementById('producto').value;
        const monto = document.getElementById('monto').value;
        const plazo = document.getElementById('plazo').value;
        const periodicidad = document.getElementById('periodicidad').value;
        const cantidadPagos = document.getElementById('cantidadPagos').value;

        if (!producto || !monto || !plazo || !periodicidad || !cantidadPagos) {
            alert('Complete tipo de crédito, monto, plazo y periodicidad.');
            return;
        }
        if (monto < 1000 || monto > 500000) {
            alert('Monto entre $1,000 y $500,000 MXN.');
            return;
        }
        if (!Number.isInteger(Number(plazo)) || plazo < 1 || plazo > 100) {
            alert('Plazo entre 1 y 100 meses.');
            return;
        }
        if (cantidadPagos <= 0) {
            alert('Revise plazo y periodicidad para calcular pagos.');
            return;
        }
        copiarDatosRepAValidacion();
        nipEnviado = false;
        campoNIP.value = '';
        campoNIP.disabled = true;
        validarHabilitacionSolicitar();
        irAEtapa4();
    });

    document.getElementById('btnAnterior3').addEventListener('click', irAEtapa2);
    document.getElementById('btnAnterior4').addEventListener('click', irAEtapa3);

    function validarHabilitacionSolicitar() {
        const act = document.getElementById('actividadEconomica').value;
        const curp = document.getElementById('curp').value;
        const rfc = document.getElementById('rfc').value;
        const emailVal = document.getElementById('email').value.trim();
        const tel = telefonoInput.value;
        const nip = campoNIP.value;
        const autorizacion = autorizacionCheckbox.checked;
        if (act && curp && rfc && emailVal && tel && nip && autorizacion && nipEnviado && nip.length === 4) {
            btnSolicitarCredito.disabled = false;
        } else {
            btnSolicitarCredito.disabled = true;
        }
    }

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

    btnEnviarNIP.addEventListener('click', function () {
        const telefono = telefonoInput.value;
        if (!telefono) {
            alert('Ingrese número telefónico.');
            return;
        }
        if (!/^\d{10}$/.test(telefono)) {
            alert('El teléfono debe tener 10 dígitos.');
            return;
        }
        telefonoModal.textContent = telefono;
        const metodoTexto = metodoEnvio === 'whatsapp' ? 'WhatsApp' : 'SMS';
        modal.querySelector('.modal-body p:first-of-type').innerHTML = `Hemos enviado un NIP por ${metodoTexto} al número:`;
        modal.style.display = 'block';
        campoNIP.disabled = false;
        campoNIP.placeholder = 'NIP de 4 dígitos';
        campoNIP.focus();
        nipEnviado = true;
        validarHabilitacionSolicitar();
    });

    document.getElementById('actividadEconomica').addEventListener('change', validarHabilitacionSolicitar);
    document.getElementById('curp').addEventListener('input', validarHabilitacionSolicitar);
    document.getElementById('rfc').addEventListener('input', validarHabilitacionSolicitar);
    document.getElementById('email').addEventListener('input', validarHabilitacionSolicitar);
    document.getElementById('email').addEventListener('change', validarHabilitacionSolicitar);
    telefonoInput.addEventListener('input', validarHabilitacionSolicitar);
    campoNIP.addEventListener('input', validarHabilitacionSolicitar);
    autorizacionCheckbox.addEventListener('change', validarHabilitacionSolicitar);

    btnSolicitarCredito.addEventListener('click', function () {
        const act = document.getElementById('actividadEconomica').value;
        const curp = document.getElementById('curp').value;
        const rfc = document.getElementById('rfc').value;
        const email = document.getElementById('email').value;
        const telefono = telefonoInput.value;
        const nip = campoNIP.value;
        if (!act || !curp || !rfc || !email || !telefono || !nip || !autorizacionCheckbox.checked) {
            alert('Complete todos los campos y autorice la consulta.');
            return;
        }
        if (curp.length !== 18) {
            alert('CURP debe tener 18 caracteres.');
            return;
        }
        if (rfc.length < 12 || rfc.length > 13) {
            alert('RFC inválido.');
            return;
        }
        if (!/^\d{10}$/.test(telefono)) {
            alert('Teléfono de 10 dígitos.');
            return;
        }
        if (nip !== '1234') {
            alert('NIP incorrecto. Demostrativo: 1234');
            return;
        }
        alert('✓ Consulta autorizada en Círculo de Crédito. Procesando solicitud.');
        mostrarResultado();
    });

    function cerrarModal() {
        modal.style.display = 'none';
    }
    closeBtn.addEventListener('click', cerrarModal);
    btnCerrarModal.addEventListener('click', cerrarModal);
    window.addEventListener('click', function (event) {
        if (event.target === modal) cerrarModal();
    });

    ['primerNombre', 'segundoNombre', 'apellidoPaterno', 'apellidoMaterno'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function (e) {
                e.target.value = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s-]/g, '').toUpperCase();
            });
        }
    });

    document.getElementById('rfcEmpresa').addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9Ññ]/g, '').toUpperCase().substring(0, 12);
    });

    const razonEl = document.getElementById('razonSocial');
    if (razonEl) {
        razonEl.addEventListener('input', function (e) {
            e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.,&/-]/g, '').toUpperCase();
        });
    }

    ['giroComercial', 'actividadPreponderante'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', function (e) {
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.,&/-]/g, '').toUpperCase();
            });
        }
    });

    document.getElementById('curpRep').addEventListener('input', function (e) {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 18);
    });
    document.getElementById('rfcRep').addEventListener('input', function (e) {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9Ññ]/g, '').substring(0, 13);
    });
    document.getElementById('telefonoRep').addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
    });

    document.getElementById('curp').addEventListener('input', function (e) {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 18);
    });
    document.getElementById('rfc').addEventListener('input', function (e) {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9Ññ]/g, '').substring(0, 13);
    });
    telefonoInput.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 10);
    });
    campoNIP.addEventListener('input', function (e) {
        e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
    });

    function bindDireccion(ids) {
        const [calle, colonia, noExt, noInt, entre] = ids;
        if (document.getElementById(calle)) {
            document.getElementById(calle).addEventListener('input', function (e) {
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.-]/g, '').toUpperCase();
            });
        }
        if (document.getElementById(colonia)) {
            document.getElementById(colonia).addEventListener('input', function (e) {
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s.-]/g, '').toUpperCase();
            });
        }
        [noExt, noInt].forEach(id2 => {
            const el = document.getElementById(id2);
            if (el) {
                el.addEventListener('input', function (e) {
                    e.target.value = e.target.value.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
                });
            }
        });
        if (document.getElementById(entre)) {
            document.getElementById(entre).addEventListener('input', function (e) {
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s,.-]/g, '').toUpperCase();
            });
        }
    }
    bindDireccion(['calleEmpresa', 'coloniaEmpresa', 'noExtEmpresa', 'noIntEmpresa', 'entreCallesEmpresa']);
    bindDireccion(['calleRep', 'coloniaRep', 'noExtRep', 'noIntRep', 'entreCallesRep']);

    console.log('Persona moral ASEFIMEX — NIP demo: 1234');
});
