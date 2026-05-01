import { collection, addDoc, serverTimestamp, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';

export async function seedClinicData(clinicId: string) {
  try {
    // 1. Check if we already have professionals (to avoid duplicate seeding if button clicked twice)
    const profsQ = query(collection(db, 'professionals'), where('clinicId', '==', clinicId), limit(1));
    const profsSnap = await getDocs(profsQ);
    if (!profsSnap.empty) {
      console.log('Data already seeded or exists.');
      return;
    }

    console.log('Seeding data for clinic:', clinicId);

    // 2. Add Professionals with embedded services
    const profs = [
      { 
        name: 'Dr. Lucas Oliveira', 
        email: 'lucas@cliny.com', 
        specialty: 'Dermatologia', 
        clinicId,
        services: [
          { id: 'svc_1_1', name: 'Limpeza de Pele Profunda', duration: 60, price: 180 },
          { id: 'svc_1_2', name: 'Peeling Químico', duration: 40, price: 350 }
        ]
      },
      { 
        name: 'Dra. Ana Beatriz', 
        email: 'ana@cliny.com', 
        specialty: 'Estética Avançada', 
        clinicId,
        services: [
          { id: 'svc_2_1', name: 'Botox (3 áreas)', duration: 45, price: 1200 },
          { id: 'svc_2_2', name: 'Microagulhamento', duration: 90, price: 450 }
        ]
      },
      { 
        name: 'Dr. Roberto Santos', 
        email: 'roberto@cliny.com', 
        specialty: 'Nutrição Esportiva', 
        clinicId,
        services: [
          { id: 'svc_3_1', name: 'Avaliação Nutricional', duration: 30, price: 250 }
        ]
      }
    ];

    const profRefs = await Promise.all(profs.map(p => addDoc(collection(db, 'professionals'), p)));

    // 3. Add Patients
    const patientsData = [
      { name: 'Mariana Silva', phone: '11988887777', email: 'mariana@email.com', clinicId },
      { name: 'Rodrigo Gomes', phone: '11977776666', email: 'rodrigo@email.com', clinicId },
      { name: 'Beatriz Santos', phone: '11966665555', email: 'beatriz@email.com', clinicId },
      { name: 'Carlos Eduardo', phone: '11955554444', email: 'carlos@email.com', clinicId },
      { name: 'Fernanda Lima', phone: '11944443333', email: 'fernanda@email.com', clinicId }
    ];

    const patientRefs = await Promise.all(patientsData.map(p => addDoc(collection(db, 'patients'), p)));

    // 4. Add Appointments (Today and Tomorrow)
    const today = new Date();
    today.setHours(9, 0, 0, 0);

    const appointments = [
      {
        clinicId,
        professionalId: profRefs[0].id,
        patientId: patientRefs[0].id,
        serviceId: 'svc_1_1',
        startTime: new Date(today.getTime() + 14.5 * 60 * 60 * 1000).toISOString(), // 14:30
        endTime: new Date(today.getTime() + 15.5 * 60 * 60 * 1000).toISOString(),
        status: 'confirmed',
        price: 180,
        createdAt: serverTimestamp()
      },
      {
        clinicId,
        professionalId: profRefs[1].id,
        patientId: patientRefs[1].id,
        serviceId: 'svc_2_1',
        startTime: new Date(today.getTime() + 15.25 * 60 * 60 * 1000).toISOString(), // 15:15
        endTime: new Date(today.getTime() + 16 * 60 * 60 * 1000).toISOString(),
        status: 'confirmed',
        price: 1200,
        createdAt: serverTimestamp()
      },
      {
        clinicId,
        professionalId: profRefs[0].id,
        patientId: patientRefs[2].id,
        serviceId: 'svc_1_2',
        startTime: new Date(today.getTime() + 16 * 60 * 60 * 1000).toISOString(), // 16:00
        endTime: new Date(today.getTime() + 16.75 * 60 * 60 * 1000).toISOString(),
        status: 'scheduled',
        price: 350,
        createdAt: serverTimestamp()
      }
    ];

    await Promise.all(appointments.map(a => addDoc(collection(db, 'appointments'), a)));
    
    console.log('Seeding complete!');
  } catch (error) {
    console.error('Error seeding data:', error);
  }
}
